import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { getCorsOptions } from './corsOptions.js';
import { SearchEngine } from './search/SearchEngine.js';
import { probePlaylistCount } from './ripper/probe.js';
import { JobManager } from './ripper/JobManager.js';

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const searchEngine = new SearchEngine({
  maxResults: Number(process.env.SEARCH_MAX_RESULTS) || 10,
  ytDlpPath: process.env.YT_DLP_PATH
});

const jobManager = new JobManager();

const app = Fastify({ logger: true });

await app.register(cors, getCorsOptions());

app.get('/health', async () => ({ ok: true }));

app.get('/api/search', async (request, reply) => {
  const q = request.query.q;
  try {
    const payload = await searchEngine.search(
      typeof q === 'string' ? q : ''
    );
    return payload;
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number(err.statusCode) || 500
        : 500;
    const message =
      err instanceof Error ? err.message : 'Erreur recherche';
    reply.status(status).send({ error: message });
  }
});

app.post('/api/probe', async (request, reply) => {
  const { url, noPlaylist, maxDownloads } = request.body || {};
  
  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ 
      ok: false, 
      error: 'URL manquante ou invalide' 
    });
  }

  try {
    const result = await probePlaylistCount(url.trim(), { 
      noPlaylist: Boolean(noPlaylist) 
    });
    
    let effectiveCount = result.count;
    if (Boolean(noPlaylist)) {
      effectiveCount = 1;
    } else if (maxDownloads && maxDownloads > 0) {
      effectiveCount = Math.min(result.count, maxDownloads);
    }
    
    return {
      ok: true,
      kind: result.kind,
      count: result.count,
      title: result.title,
      effectiveCount
    };
  } catch (err) {
    app.log.error('Probe error:', err);
    return reply.status(500).send({ 
      ok: false, 
      error: err.message || 'Échec de l\'analyse' 
    });
  }
});

app.post('/api/download', async (request, reply) => {
  const { url, noPlaylist, maxDownloads } = request.body || {};
  
  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ 
      error: 'URL manquante ou invalide' 
    });
  }

  const clientIp = request.headers['x-forwarded-for'] || request.ip;

  try {
    const jobId = jobManager.createJob({
      url: url.trim(),
      noPlaylist: Boolean(noPlaylist),
      maxDownloads: Number(maxDownloads) || 0,
      ip: clientIp
    });
    
    return { jobId };
  } catch (err) {
    app.log.error('Download error:', err);
    return reply.status(500).send({ 
      error: err.message || 'Échec du démarrage' 
    });
  }
});

app.post('/api/download-batch', async (request, reply) => {
  const { urls } = request.body || {};
  
  if (!Array.isArray(urls) || urls.length === 0) {
    return reply.status(400).send({ 
      error: 'URLs manquantes ou invalides' 
    });
  }
  
  if (urls.length > 50) {
    return reply.status(400).send({ 
      error: 'Maximum 50 URLs' 
    });
  }

  const clientIp = request.headers['x-forwarded-for'] || request.ip;

  try {
    const jobId = jobManager.createBatchJob({
      urls: urls.map(u => String(u).trim()),
      ip: clientIp
    });
    
    return { jobId };
  } catch (err) {
    app.log.error('Batch download error:', err);
    return reply.status(500).send({ 
      error: err.message || 'Échec du démarrage' 
    });
  }
});

app.get('/api/jobs/:jobId/stream', async (request, reply) => {
  const { jobId } = request.params;
  const job = jobManager.getJob(jobId);
  
  if (!job) {
    return reply.status(404).send({ error: 'Job introuvable' });
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendEvent = (event, data) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  };

  job.logs.forEach(line => sendEvent('log', line));
  
  if (job.progress) {
    sendEvent('progress', job.progress);
  }

  const unsubscribe = jobManager.onJobEvent(jobId, (eventData) => {
    if (eventData.type === 'log') {
      sendEvent('log', eventData.line);
    } else if (eventData.type === 'progress') {
      sendEvent('progress', eventData.progress);
    } else if (eventData.type === 'complete') {
      sendEvent('complete', {
        success: eventData.success,
        downloadUrl: eventData.downloadUrl,
        error: eventData.error
      });
      reply.raw.end();
      unsubscribe();
    }
  });

  request.raw.on('close', () => {
    unsubscribe();
  });

  if (job.status === 'completed' || job.status === 'failed') {
    sendEvent('complete', {
      success: job.status === 'completed',
      downloadUrl: job.zipPath ? `/api/jobs/${jobId}/download` : null,
      error: job.error
    });
    reply.raw.end();
    unsubscribe();
  }
});

app.get('/api/jobs/:jobId/download', async (request, reply) => {
  const { jobId } = request.params;
  const job = jobManager.getJob(jobId);
  
  if (!job || !job.zipPath) {
    return reply.status(404).send({ error: 'Fichier introuvable' });
  }

  try {
    const stats = await stat(job.zipPath);
    const stream = createReadStream(job.zipPath);
    
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="yt-ripper-${jobId}.zip"`);
    reply.header('Content-Length', stats.size);
    
    return reply.send(stream);
  } catch (err) {
    app.log.error('Download file error:', err);
    return reply.status(500).send({ error: 'Échec du téléchargement' });
  }
});

setInterval(() => {
  jobManager.cleanupOldJobs(3600_000);
}, 600_000);

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
