import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  DOWNLOAD_OUTPUT_AUDIO,
  DOWNLOAD_OUTPUT_VIDEO
} from '../ripper/runDownload.js';
import { checkWorkerIngestGate } from '../workerIngestGate.js';

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
function requireIngestSecret(request, reply) {
  const secret = process.env.WORKER_INGEST_SECRET?.trim();
  if (!secret) {
    reply.status(503).send({
      error:
        'WORKER_INGEST_SECRET non configuré côté API (variable d’environnement).'
    });
    return false;
  }
  const auth = request.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m?.[1]?.trim();
  if (token !== secret) {
    reply.status(401).send({ error: 'Non autorisé' });
    return false;
  }
  return true;
}

const ALLOWED_EXT = new Set([
  '.mp3',
  '.mp4',
  '.webm',
  '.mkv',
  '.m4a',
  '.opus'
]);

function sanitizeFilename(name, fallbackExt) {
  const base = path
    .basename(name || 'upload')
    .replace(/[^\w.\- ()\u00C0-\u024F]/g, '_');
  if (!base || base === '.' || base === '..') {
    return `upload${fallbackExt}`;
  }
  return base;
}

/**
 * Ingestion fichiers depuis le worker maison (plugin Fastify, préfixe /api/worker).
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ jobManager: import('../ripper/JobManager.js').JobManager }} opts
 */
export default async function workerIngestRoutes(fastify, opts) {
  const { jobManager } = opts;

  fastify.post('/jobs/reserve', async (request, reply) => {
    if (!requireIngestSecret(request, reply)) return;

    const gate = checkWorkerIngestGate();
    if (gate.blocked) {
      request.log.warn(
        { tag: 'ingest', blocked: true, reason: gate.logReason },
        `[ingest] Refus réservation — ${gate.message}`
      );
      return reply.status(503).send({ error: gate.message, code: gate.code });
    }

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const rawOut = body.output;
    const output =
      rawOut === 'audio' ? DOWNLOAD_OUTPUT_AUDIO : DOWNLOAD_OUTPUT_VIDEO;

    const jobId = await jobManager.createAwaitingWorkerIngest({ output });
    return reply.send({ jobId });
  });

  /** Poll pour relay auto depuis la machine résidentielle (Bearer WORKER_INGEST_SECRET). */
  fastify.get(
    '/delegations/next',
    { disableRequestLogging: true },
    async (request, reply) => {
      if (!requireIngestSecret(request, reply)) return;

      const gate = checkWorkerIngestGate();
      if (gate.blocked) {
        return reply.status(503).send({ error: gate.message, code: gate.code });
      }

      const task = jobManager.getDelegationRelayTask();
      if (!task) {
        return reply.status(204).send();
      }
      return reply.send(task);
    }
  );

  /** Rapport de progression yt-dlp pendant le relais (SSE barre côté client). */
  fastify.post('/jobs/:jobId/progress', async (request, reply) => {
    if (!requireIngestSecret(request, reply)) return;

    const gate = checkWorkerIngestGate();
    if (gate.blocked) {
      return reply.status(503).send({ error: gate.message, code: gate.code });
    }

    const { jobId } = request.params;
    const body =
      request.body && typeof request.body === 'object' ? request.body : {};
    const result = jobManager.reportWorkerRelayProgress(jobId, {
      filePct: body.filePct
    });

    if (!result.ok) {
      const status =
        result.error === 'Job introuvable' ||
        result.error === 'Job pas en attente du relais local'
          ? 404
          : 400;
      return reply.status(status).send({ error: result.error });
    }

    return reply.send({ ok: true });
  });

  fastify.post('/ingest/:jobId', async (request, reply) => {
    if (!requireIngestSecret(request, reply)) return;

    const gate = checkWorkerIngestGate();
    if (gate.blocked) {
      request.log.warn(
        { tag: 'ingest', blocked: true, reason: gate.logReason, route: 'ingest' },
        `[ingest] Refus upload — ${gate.message}`
      );
      return reply.status(503).send({ error: gate.message, code: gate.code });
    }

    const { jobId } = request.params;
    const job = jobManager.getJob(jobId);

    const canReceive =
      job?.workerIngest &&
      (job.status === 'awaiting_upload' ||
        job.status === 'awaiting_local_worker');
    if (!canReceive) {
      return reply
        .status(404)
        .send({ error: 'Job introuvable ou ne peut plus recevoir de fichier' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'Champ multipart "file" requis' });
    }

    const ext = path.extname(data.filename || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return reply.status(400).send({
        error: `Extension refusée : ${ext || '(vide)'} — autoriser : ${[...ALLOWED_EXT].join(', ')}`
      });
    }

    const safeName = sanitizeFilename(data.filename, ext);
    const destPath = path.join(job.jobDir, safeName);

    await pipeline(data.file, createWriteStream(destPath));

    const done = await jobManager.finalizeWorkerIngestFile(jobId, {
      path: destPath,
      name: safeName
    });

    if (!done.ok) {
      return reply.status(500).send({ error: done.error || 'Échec enregistrement' });
    }

    return reply.send({
      ok: true,
      jobId,
      files: job.files.map((f, index) => ({
        name: f.name,
        url: `/api/jobs/${jobId}/file/${index}`,
        size: f.size
      }))
    });
  });
}
