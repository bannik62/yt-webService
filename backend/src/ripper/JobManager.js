import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  runDownload,
  DOWNLOAD_OUTPUT_AUDIO,
  DOWNLOAD_OUTPUT_VIDEO
} from './runDownload.js';
import { PLAYLIST_MAX_TRACKS } from './playlistLimit.js';
import { formatDownloadErrorForUser } from './downloadErrorMessage.js';
import { resolveProxyUrl } from '../proxy/proxyManager.js';
import { ProxyQuotaError, DelegationTimedOutError } from './proxyQuotaError.js';
import { claimNextProbeRelayTask } from './probeDelegationManager.js';
import {
  needsWorkerIngestTranscode,
  transcodeWorkerIngest,
  getFfmpegBinOrNull
} from './transcodeIngest.js';
import { incrementDownloadStats } from '../downloadStats.js';

/**
 * @param {unknown} v — `'audio' \| 'video'` ou constante download
 */
function coerceJobOutput(v) {
  if (v === DOWNLOAD_OUTPUT_VIDEO || v === 'video') {
    return DOWNLOAD_OUTPUT_VIDEO;
  }
  return DOWNLOAD_OUTPUT_AUDIO;
}

/**
 * @returns {number}
 */
function delegationFallbackWaitMs() {
  const raw = process.env.WORKER_LOCAL_DELEGATION_WAIT_MS;
  if (raw === undefined || raw === '') return 90000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3000 ? n : 90000;
}

/**
 * @param {string} s
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Dernier segment d’un chemin (nom de fichier), sans exposer tmp / UUID.
 * @param {string} raw
 */
function safeBasenameFromPath(raw) {
  const u = String(raw).split('\\').join('/').trim();
  if (!u) return '';
  const base = path.basename(u.replace(/\/+$/, ''));
  return base || u;
}

/**
 * Masque les chemins tmp / job dans les lignes de log (VPS `runDownload` + relay `relay-log`).
 * Remplace les chemins par le **nom de fichier** seul quand c’est possible.
 * @param {string} line
 */
function sanitizeJobLogLineForSse(line) {
  let s = String(line).replace(/\r/g, '');
  const t = s.trim();

  const downloadDest = t.match(/^\[download\]\s*Destination:\s*(.+)$/i);
  if (downloadDest) {
    const name = safeBasenameFromPath(downloadDest[1]);
    return name ? `[download] ${name}` : '[download]';
  }

  if (/^\[download\]\s+Merging formats into\s+/i.test(t)) {
    const rest = t.replace(/^\[download\]\s+Merging formats into\s+/i, '').trim();
    const unquoted = rest.replace(/^["']|["']$/g, '');
    const name = safeBasenameFromPath(unquoted);
    return name ? `[download] Fusion : ${name}` : '[download] Fusion des formats';
  }

  const extractDest = t.match(/^\[ExtractAudio\]\s*Destination:\s*(.+)$/i);
  if (extractDest) {
    const name = safeBasenameFromPath(extractDest[1]);
    return name ? `[ExtractAudio] ${name}` : '[ExtractAudio]';
  }

  const delMatch = t.match(/^Deleting original file\s+(.+)$/i);
  if (delMatch) {
    const rest = delMatch[1].trim();
    const paren = /\s+(\([^)]*\))\s*$/.exec(rest);
    const pathOnly = paren ? rest.slice(0, paren.index).trim() : rest;
    const suffix = paren ? ` ${paren[1]}` : '';
    const name = safeBasenameFromPath(pathOnly);
    return name ? `Deleting original file ${name}${suffix}` : t;
  }

  const tmpBase = path.join(os.tmpdir(), 'yt-ripper-jobs').replace(/\\/g, '/');
  const uuidSeg =
    '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const jobDirPrefix = new RegExp(
    `${escapeRegExp(tmpBase)}/${uuidSeg}/`,
    'gi'
  );

  const unified = s.split('\\').join('/');
  let out = unified.replace(jobDirPrefix, '');
  out = out.replace(
    /yt-ripper-jobs\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\//gi,
    ''
  );
  out = out.replace(/["']([^"'\n]*)yt-ripper-jobs[^"'\n]*["']/gi, (_q, inner) => {
    const name = safeBasenameFromPath(inner);
    return name ? `"${name}"` : '"[fichier]"';
  });
  return out.trimEnd();
}

/** Après cette ligne relay, la barre ~90 % (reste : upload → VPS + encodage éventuel → 100 % à finalize). */
function isRelayYtdlpTerminalSuccessLog(line) {
  return /✅\s*Téléchargement terminé\s*!/i.test(String(line).trim());
}

/**
 * Gestionnaire de queue de jobs de téléchargement
 * Un seul job à la fois pour éviter de surcharger le serveur
 */
export class JobManager extends EventEmitter {
  #jobs = new Map();
  #queue = [];
  #currentJob = null;
  #tempDir = path.join(os.tmpdir(), 'yt-ripper-jobs');
  /** Durées des derniers jobs terminés avec succès (ms) — estimation d'attente */
  #recentDurationsMs = [];
  /** JobId → résolve `Promise.race` délégation (402 + session navigateur) */
  #delegationWake = new Map();
  static #MAX_DURATION_SAMPLES = 10;

  constructor() {
    super();
    this.#ensureTempDir();
  }

  async #ensureTempDir() {
    try {
      await fs.mkdir(this.#tempDir, { recursive: true });
    } catch (err) {
      console.error('Échec création tmpdir:', err);
    }
  }

  /**
   * Crée un nouveau job
   * @param {object} params
   * @param {string} params.url
   * @param {boolean} params.noPlaylist
   * @param {number} params.maxDownloads
   * @param {string} params.ip - Pour rate limiting futur
   * @param {number | undefined} params.proxyIndex - Index dans le pool WebShare
   * @param {'audio' | 'video'} [params.output] — défaut `audio`
   * @returns {string} jobId
   */
  createJob({
    url,
    noPlaylist,
    maxDownloads,
    ip,
    proxyIndex,
    workerSessionId = '',
    output: outputRaw = 'audio'
  }) {
    const jobId = randomUUID();
    const jobDir = path.join(this.#tempDir, jobId);
    const output = coerceJobOutput(outputRaw);

    const job = {
      id: jobId,
      urls: [url],
      noPlaylist,
      maxDownloads,
      output,
      ip,
      proxyIndex,
      workerSessionId:
        typeof workerSessionId === 'string' ? workerSessionId : '',
      status: 'queued',
      logs: [],
      progress: { filePct: 0, itemIndex: 1, itemTotal: 1 },
      createdAt: Date.now(),
      jobDir,
      files: [],
      error: null
    };

    this.#jobs.set(jobId, job);
    this.#queue.push(jobId);
    this.#emitQueuedStatusIfNeeded(jobId);
    this.#processQueue();

    return jobId;
  }

  /**
   * Crée un job batch (plusieurs URLs)
   * @param {object} params
   * @param {string[]} params.urls
   * @param {string} params.ip
   * @param {number | undefined} params.proxyIndex
   * @param {'audio' | 'video'} [params.output] — défaut `video` (MP4)
   * @returns {string} jobId
   */
  createBatchJob({
    urls,
    ip,
    proxyIndex,
    workerSessionId = '',
    output: outputRaw = 'video'
  }) {
    const jobId = randomUUID();
    const jobDir = path.join(this.#tempDir, jobId);
    const output = coerceJobOutput(outputRaw);

    const job = {
      id: jobId,
      urls: urls,
      noPlaylist: true, // Toujours single pour batch
      maxDownloads: PLAYLIST_MAX_TRACKS,
      output,
      ip,
      proxyIndex,
      workerSessionId:
        typeof workerSessionId === 'string' ? workerSessionId : '',
      status: 'queued',
      logs: [],
      progress: { filePct: 0, itemIndex: 1, itemTotal: urls.length },
      createdAt: Date.now(),
      jobDir,
      files: [],
      error: null
    };

    this.#jobs.set(jobId, job);
    this.#queue.push(jobId);
    this.#emitQueuedStatusIfNeeded(jobId);
    this.#processQueue();

    return jobId;
  }

  /**
   * Récupère un job
   * @param {string} jobId
   * @returns {object|null}
   */
  getJob(jobId) {
    return this.#jobs.get(jobId) || null;
  }

  /**
   * Prochain téléchargement à relayer (awaiting_local_worker), FIFO par delegationStartedAt,
   * ou tâche **probe** déléguée (prioritaire, même poll `GET /delegations/next`).
   * Worker local : GET /api/worker/delegations/next avec Bearer WORKER_INGEST_SECRET.
   * @returns {(
   *   { kind: 'probe', probeId: string, url: string, noPlaylist: boolean } |
   *   { jobId: string, url: string, output: 'audio'|'video', noPlaylist: boolean } |
   *   null
   * )}
   */
  getDelegationRelayTask() {
    const probeTask = claimNextProbeRelayTask();
    if (probeTask) return probeTask;

    /** @type {Array<{ jobId: string; job: object; t: number }>} */
    const list = [];
    for (const [jobId, job] of this.#jobs.entries()) {
      if (
        job.status !== 'awaiting_local_worker' ||
        !job.workerIngest ||
        !Array.isArray(job.urls) ||
        job.urls.length === 0
      ) {
        continue;
      }

      let idx =
        typeof job.delegationUrlIndex === 'number' &&
        Number.isFinite(job.delegationUrlIndex)
          ? Math.floor(job.delegationUrlIndex)
          : 0;
      idx = Math.max(0, Math.min(idx, job.urls.length - 1));
      const u = job.urls[idx];
      if (!u || typeof u !== 'string') continue;

      const t =
        typeof job.delegationStartedAt === 'number' &&
        Number.isFinite(job.delegationStartedAt)
          ? job.delegationStartedAt
          : job.createdAt ?? 0;

      list.push({ jobId, job, t });
    }
    if (list.length === 0) return null;

    list.sort((a, b) => a.t - b.t);
    const first = list[0];
    const job = first.job;

    let idx =
      typeof job.delegationUrlIndex === 'number' &&
      Number.isFinite(job.delegationUrlIndex)
        ? Math.floor(job.delegationUrlIndex)
        : 0;
    idx = Math.max(0, Math.min(idx, job.urls.length - 1));

    const output =
      job.output === DOWNLOAD_OUTPUT_VIDEO ? 'video' : 'audio';
    return {
      jobId: first.jobId,
      url: job.urls[idx],
      output,
      noPlaylist: Boolean(job.noPlaylist)
    };
  }

  /**
   * Job réservé pour upload depuis le worker local (pas de téléchargement VPS, pas de file d’attente).
   * @param {object} [opts]
   * @param {'audio' | 'video'} [opts.output]
   * @returns {Promise<string>} jobId
   */
  async createAwaitingWorkerIngest({ output = DOWNLOAD_OUTPUT_VIDEO } = {}) {
    const jobId = randomUUID();
    const jobDir = path.join(this.#tempDir, jobId);
    const out =
      output === DOWNLOAD_OUTPUT_AUDIO
        ? DOWNLOAD_OUTPUT_AUDIO
        : DOWNLOAD_OUTPUT_VIDEO;

    const job = {
      id: jobId,
      urls: [],
      workerIngest: true,
      ip: null,
      proxyIndex: undefined,
      noPlaylist: true,
      maxDownloads: 0,
      output: out,
      status: 'awaiting_upload',
      logs: ['\n[worker] Job réservé — en attente de l’upload du fichier.\n'],
      progress: { filePct: 0, itemIndex: 1, itemTotal: 1 },
      createdAt: Date.now(),
      jobDir,
      files: [],
      error: null
    };

    this.#jobs.set(jobId, job);
    await fs.mkdir(jobDir, { recursive: true });
    return jobId;
  }

  /**
   * Après écriture du fichier média dans jobDir.
   * @param {string} jobId
   * @param {{ path: string, name: string }} entry
   * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
   */
  async finalizeWorkerIngestFile(jobId, { path: filePath, name }) {
    const job = this.#jobs.get(jobId);
    if (!job?.workerIngest) {
      return { ok: false, error: 'Job introuvable' };
    }
    const canReceive =
      job.status === 'awaiting_upload' ||
      job.status === 'awaiting_local_worker';
    if (!canReceive) {
      return { ok: false, error: 'Ce job ne peut plus recevoir de fichier' };
    }

    const dirResolved = path.resolve(job.jobDir);
    const resolved = path.resolve(filePath);
    if (
      resolved !== dirResolved &&
      !resolved.startsWith(dirResolved + path.sep)
    ) {
      return { ok: false, error: 'Chemin fichier invalide' };
    }

    try {
      const extLower = path.extname(name).toLowerCase();
      let outPath = resolved;
      let outName = name;

      if (needsWorkerIngestTranscode(job, extLower)) {
        const ffmpegBin = getFfmpegBinOrNull();
        if (!ffmpegBin) {
          throw new Error(
            'ffmpeg indisponible sur le serveur : impossible de convertir le fichier ingéré.'
          );
        }
        const base = path.basename(name, extLower);
        const outExt =
          job.output === DOWNLOAD_OUTPUT_AUDIO ? '.mp3' : '.mp4';
        const targetPath = path.join(job.jobDir, `${base}${outExt}`);

        this.#emitJobEvent(jobId, 'log', {
          line:
            job.output === DOWNLOAD_OUTPUT_AUDIO
              ? '[VPS] Encodage MP3 sur le serveur (ffmpeg)…'
              : '[VPS] Encodage MP4 sur le serveur (ffmpeg)…'
        });

        const mode =
          job.output === DOWNLOAD_OUTPUT_AUDIO ? 'audio-mp3' : 'video-mp4';

        await transcodeWorkerIngest({
          ffmpegBin,
          inputPath: resolved,
          outputPath: targetPath,
          mode,
          onProgress: (p) => {
            const urlLen = Array.isArray(job.urls) ? job.urls.length : 0;
            const itemTotal = Math.max(1, urlLen);
            let idx =
              typeof job.delegationUrlIndex === 'number' &&
              Number.isFinite(job.delegationUrlIndex)
                ? Math.floor(job.delegationUrlIndex)
                : 0;
            idx = Math.max(0, Math.min(idx, itemTotal - 1));
            const mapped = 90 + Math.min(9, Math.round((p / 100) * 9));
            job.progress = {
              filePct: mapped,
              itemIndex: idx + 1,
              itemTotal
            };
            this.#emitJobEvent(jobId, 'progress', { progress: job.progress });
          }
        });

        if (targetPath !== resolved) {
          await fs.unlink(resolved).catch(() => {});
        }
        outPath = targetPath;
        outName = `${base}${outExt}`;
      }

      const stats = await fs.stat(outPath);
      job.files = [{ name: outName, path: outPath, size: stats.size }];
      job.status = 'completed';

      const urlLen = Array.isArray(job.urls) ? job.urls.length : 0;
      const itemTotal = Math.max(1, urlLen);
      let idx =
        typeof job.delegationUrlIndex === 'number' &&
        Number.isFinite(job.delegationUrlIndex)
          ? Math.floor(job.delegationUrlIndex)
          : 0;
      idx = Math.max(0, Math.min(idx, itemTotal - 1));
      job.progress = {
        filePct: 100,
        itemIndex: idx + 1,
        itemTotal
      };
      this.#emitJobEvent(jobId, 'progress', { progress: job.progress });

      job.logs.push(
        `\n[worker] Fichier prêt : ${outName} (${stats.size} octets)\n`
      );
      this.#emitJobEvent(jobId, 'log', {
        line: `[worker] Fichier prêt : ${outName}`
      });
      this.#emitJobEvent(jobId, 'complete', {
        success: true,
        files: job.files.map((file, index) => ({
          name: file.name,
          url: `/api/jobs/${jobId}/file/${index}`,
          size: file.size
        }))
      });
      void incrementDownloadStats({ files: job.files.length });
      const wakeDelegation = this.#delegationWake.get(jobId);
      if (wakeDelegation) {
        this.#delegationWake.delete(jobId);
        wakeDelegation();
      }
      return { ok: true };
    } catch (err) {
      console.error('[JobManager] finalizeWorkerIngestFile', err);
      job.status = 'failed';
      job.error = formatDownloadErrorForUser(err);
      this.#emitJobEvent(jobId, 'complete', {
        success: false,
        error: job.error
      });
      const wakeDelegation = this.#delegationWake.get(jobId);
      if (wakeDelegation) {
        this.#delegationWake.delete(jobId);
        wakeDelegation();
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Progression yt-dlp rapportée par le worker pendant une délégation (`awaiting_local_worker`).
   * @param {string} jobId
   * @param {{ filePct: unknown }} payload
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  reportWorkerRelayProgress(jobId, { filePct }) {
    const job = this.#jobs.get(jobId);
    if (!job?.workerIngest) {
      return { ok: false, error: 'Job introuvable' };
    }
    if (job.status !== 'awaiting_local_worker') {
      return {
        ok: false,
        error: 'Job pas en attente du relais local'
      };
    }

    if (!job.relayDownloadProgressAnnounced) {
      job.relayDownloadProgressAnnounced = true;
      const line =
        '[relais] Téléchargement sur ta machine — la barre suit le pourcentage envoyé par le worker.';
      job.logs.push(`${line}\n`);
      this.#emitJobEvent(jobId, 'log', { line });
    }

    let pct = Number(filePct);
    if (!Number.isFinite(pct)) {
      return { ok: false, error: 'filePct invalide' };
    }
    pct = Math.max(0, Math.min(100, pct));
    /** Réserve ~90 % de la barre pour extract / upload / encodage : le worker ne remplit que 0–10 % ici. */
    const displayPct =
      pct >= 100 ? 10 : Math.round((Math.min(100, pct) / 100) * 10);

    const urlLen = Array.isArray(job.urls) ? job.urls.length : 0;
    const itemTotal = Math.max(1, urlLen);
    let idx =
      typeof job.delegationUrlIndex === 'number' &&
      Number.isFinite(job.delegationUrlIndex)
        ? Math.floor(job.delegationUrlIndex)
        : 0;
    idx = Math.max(0, Math.min(idx, itemTotal - 1));
    const itemIndex = idx + 1;

    job.progress = {
      filePct: displayPct,
      itemIndex,
      itemTotal
    };
    this.#emitJobEvent(jobId, 'progress', { progress: job.progress });
    return { ok: true };
  }

  /**
   * Ligne de log yt-dlp (stdout/stderr) envoyée par le worker pendant le relais.
   * @param {string} jobId
   * @param {string} line
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  appendWorkerRelayLog(jobId, line) {
    const job = this.#jobs.get(jobId);
    if (!job?.workerIngest) {
      return { ok: false, error: 'Job introuvable' };
    }
    if (job.status !== 'awaiting_local_worker') {
      return {
        ok: false,
        error: 'Job pas en attente du relais local'
      };
    }
    const raw = typeof line === 'string' ? line : '';
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!text) {
      return { ok: false, error: 'line vide' };
    }
    const safe = sanitizeJobLogLineForSse(text);
    if (!safe.trim()) {
      return { ok: false, error: 'line vide' };
    }
    const clipped = safe.length > 8000 ? `${safe.slice(0, 7997)}…` : safe;
    job.logs.push(`${clipped}\n`);
    this.#emitJobEvent(jobId, 'log', { line: clipped });

    if (isRelayYtdlpTerminalSuccessLog(clipped)) {
      const urlLen = Array.isArray(job.urls) ? job.urls.length : 0;
      const itemTotal = Math.max(1, urlLen);
      let idx =
        typeof job.delegationUrlIndex === 'number' &&
        Number.isFinite(job.delegationUrlIndex)
          ? Math.floor(job.delegationUrlIndex)
          : 0;
      idx = Math.max(0, Math.min(idx, itemTotal - 1));
      job.progress = {
        filePct: 90,
        itemIndex: idx + 1,
        itemTotal
      };
      this.#emitJobEvent(jobId, 'progress', { progress: job.progress });
    }

    return { ok: true };
  }

  /**
   * État file d'attente pour affichage client (SSE)
   * @param {string} jobId
   * @returns {{ status: string, position?: number, queueLength?: number, estimatedSeconds?: number | null } | null}
   */
  getQueueStatus(jobId) {
    const job = this.#jobs.get(jobId);
    if (!job) return null;
    if (job.status === 'running') {
      return { status: 'running' };
    }
    if (job.status === 'awaiting_local_worker') {
      return { status: 'awaiting_local_worker' };
    }
    if (job.status === 'awaiting_upload') {
      return { status: 'awaiting_upload' };
    }
    if (job.status !== 'queued') {
      return null;
    }
    const idx = this.#queue.indexOf(jobId);
    if (idx < 0) {
      return { status: 'running' };
    }
    const slots = idx + (this.#currentJob ? 1 : 0);
    const avg = this.#avgJobDurationMs();
    return {
      status: 'queued',
      position: idx + 1,
      queueLength: this.#queue.length,
      estimatedSeconds:
        avg && slots > 0 ? Math.max(5, Math.ceil((slots * avg) / 1000)) : null
    };
  }

  #avgJobDurationMs() {
    if (this.#recentDurationsMs.length === 0) return null;
    const sum = this.#recentDurationsMs.reduce((a, b) => a + b, 0);
    return sum / this.#recentDurationsMs.length;
  }

  #recordSuccessfulDurationMs(ms) {
    if (!Number.isFinite(ms) || ms < 1000) return;
    this.#recentDurationsMs.push(ms);
    if (this.#recentDurationsMs.length > JobManager.#MAX_DURATION_SAMPLES) {
      this.#recentDurationsMs.shift();
    }
  }

  #emitQueuedStatusIfNeeded(jobId) {
    const payload = this.getQueueStatus(jobId);
    if (payload && payload.status === 'queued') {
      this.#emitJobEvent(jobId, 'status', payload);
    }
  }

  /**
   * Subscribe aux événements d'un job
   * @param {string} jobId
   * @param {function} callback
   */
  onJobEvent(jobId, callback) {
    const handler = (data) => {
      if (data.jobId === jobId) callback(data);
    };
    this.on('job-event', handler);
    return () => this.off('job-event', handler);
  }

  /**
   * Après erreur quota proxy avec session navigateur : attente ingest local (phase ultérieure) puis échec time-out.
   * @param {string} jobId
   * @param {object} job
   */
  async #relayWaitAfterProxyQuota(jobId, job) {
    const waitLine =
      'Préparation côté navigateur… Tu peux garder cette page ouverte quelques instants.';
    const ms = delegationFallbackWaitMs();

    const ingestPromise = new Promise((resolve) => {
      this.#delegationWake.set(jobId, resolve);
    });

    job.workerIngest = true;
    job.status = 'awaiting_local_worker';
    this.#emitJobEvent(jobId, 'status', { status: 'awaiting_local_worker' });

    const urlLen = Array.isArray(job.urls) ? job.urls.length : 0;
    const itemTotal = Math.max(1, urlLen);
    let idx =
      typeof job.delegationUrlIndex === 'number' &&
      Number.isFinite(job.delegationUrlIndex)
        ? Math.floor(job.delegationUrlIndex)
        : 0;
    idx = Math.max(0, Math.min(idx, itemTotal - 1));
    job.progress = {
      filePct: 0,
      itemIndex: idx + 1,
      itemTotal
    };
    this.#emitJobEvent(jobId, 'progress', { progress: job.progress });

    const stepLine =
      'Étape : attente du worker (tunnel). Les messages d’avancement s’affichent ici sans chemins sensibles.';
    job.logs.push(`\n${waitLine}\n${stepLine}\n`);
    this.#emitJobEvent(jobId, 'log', { line: waitLine });
    this.#emitJobEvent(jobId, 'log', { line: stepLine });
    let timerId;
    const timeoutPromise = new Promise((resolve) => {
      timerId = setTimeout(resolve, ms);
    });
    await Promise.race([ingestPromise, timeoutPromise]);
    clearTimeout(timerId);
    this.#delegationWake.delete(jobId);

    if (job.status === 'completed') {
      console.log(
        `[Delegation] Job ${jobId}: relais local OK — fichier reçu (ingest), job terminé.`
      );
      return;
    }

    console.warn(
      `[Delegation] Job ${jobId}: time-out relais (~${delegationFallbackWaitMs()} ms) sans POST /api/worker/ingest (worker local trop lent ou absent).`
    );

    job.status = 'failed';
    const err = new DelegationTimedOutError();
    job.error = formatDownloadErrorForUser(err);
    this.#emitJobEvent(jobId, 'complete', {
      success: false,
      error: job.error
    });
  }

  async #processQueue() {
    if (this.#currentJob || this.#queue.length === 0) return;

    const jobId = this.#queue.shift();
    const job = this.#jobs.get(jobId);
    if (!job) return;

    this.#currentJob = jobId;
    job.status = 'running';
    job.startedAt = Date.now();
    this.#emitJobEvent(jobId, 'status', { status: 'running' });
    for (const waitingId of this.#queue) {
      this.#emitQueuedStatusIfNeeded(waitingId);
    }

    try {
      await fs.mkdir(job.jobDir, { recursive: true });

      // Traiter toutes les URLs du job
      for (let i = 0; i < job.urls.length; i++) {
        const url = job.urls[i];
        job.currentProcessingIndex = i;

        job.logs.push(`\n=== Traitement ${i + 1}/${job.urls.length}: ${url} ===\n`);
        this.#emitJobEvent(jobId, 'log', { line: `\n=== Traitement ${i + 1}/${job.urls.length} ===` });

        const proxyUrl = resolveProxyUrl(job.proxyIndex);

        await runDownload({
          url,
          targetDir: job.jobDir,
          noPlaylist: job.noPlaylist,
          maxDownloads: job.maxDownloads ?? 0,
          output: job.output || DOWNLOAD_OUTPUT_AUDIO,
          proxyUrl,
          onLog: (line) => {
            const safe = sanitizeJobLogLineForSse(line);
            const lineOut = safe.endsWith('\n') ? safe : `${safe}\n`;
            job.logs.push(lineOut);
            this.#emitJobEvent(jobId, 'log', { line: safe });
          },
          onProgress: (progress) => {
            const overallItemIndex = i + 1;
            const overallItemTotal = job.urls.length;
            job.progress = {
              filePct: progress.filePct,
              itemIndex: overallItemIndex,
              itemTotal: overallItemTotal
            };
            this.#emitJobEvent(jobId, 'progress', { progress: job.progress });
          }
        });
      }

      // Lister les fichiers téléchargés
      const files = await this.#listDownloadedFiles(jobId, job.jobDir, job);
      job.files = files;
      job.status = 'completed';
      if (job.startedAt) {
        this.#recordSuccessfulDurationMs(Date.now() - job.startedAt);
      }
      this.#emitJobEvent(jobId, 'complete', {
        success: true,
        files: files.map((file, index) => ({
          name: file.name,
          url: `/api/jobs/${jobId}/file/${index}`,
          size: file.size
        }))
      });
      void incrementDownloadStats({ files: files.length });
    } catch (err) {
      const sessionTrimmed =
        typeof job.workerSessionId === 'string'
          ? job.workerSessionId.trim()
          : '';
      const delegation =
        err instanceof ProxyQuotaError && sessionTrimmed.length > 0;

      if (delegation) {
        job.delegationUrlIndex =
          typeof job.currentProcessingIndex === 'number' &&
          Number.isFinite(job.currentProcessingIndex)
            ? job.currentProcessingIndex
            : 0;
        job.delegationStartedAt = Date.now();
        console.warn(
          `[Proxy] Job ${jobId}: le proxy uplink refuse (quota / tunnel 402-type) alors que yt-dlp passait déjà par le proxy.`
        );
        console.warn(
          `[Delegation] Job ${jobId}: session navigateur OK → mode relais machine locale (polling GET /api/worker/delegations/next, fenêtre ~${delegationFallbackWaitMs()} ms).`
        );
        try {
          await this.#relayWaitAfterProxyQuota(jobId, job);
        } catch (relayErr) {
          console.error(
            `[Delegation] Job ${jobId} erreur pendant attente relay:`,
            relayErr
          );
          job.status = 'failed';
          job.error = formatDownloadErrorForUser(relayErr);
          this.#emitJobEvent(jobId, 'complete', {
            success: false,
            error: job.error
          });
        }
      } else {
        if (err instanceof ProxyQuotaError) {
          console.warn(
            `[Proxy] Job ${jobId}: 402/quota tunnel sans session navigateur (pas d’en-tête client) — pas de bascule relais automatique.`
          );
        }
        job.status = 'failed';
        console.error(`[JobManager] Job ${jobId} échec:`, err);
        job.error = formatDownloadErrorForUser(err);
        this.#emitJobEvent(jobId, 'complete', {
          success: false,
          error: job.error
        });
      }
    } finally {
      this.#currentJob = null;
      this.#processQueue();
    }
  }

  #mediaSuffixes(job) {
    return job.output === DOWNLOAD_OUTPUT_VIDEO
      ? ['.mp4', '.webm', '.mkv']
      : ['.mp3'];
  }

  async #listDownloadedFiles(jobId, jobDir, job) {
    try {
      const entries = await fs.readdir(jobDir, { withFileTypes: true });
      const files = [];
      const suffixes = this.#mediaSuffixes(job);

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const lower = entry.name.toLowerCase();
        if (!suffixes.some((s) => lower.endsWith(s))) continue;
        const filePath = path.join(jobDir, entry.name);
        const stats = await fs.stat(filePath);
        files.push({
          name: entry.name,
          path: filePath,
          size: stats.size
        });
      }

      return files;
    } catch (err) {
      console.error(`Erreur listage fichiers job ${jobId}:`, err);
      return [];
    }
  }

  #emitJobEvent(jobId, type, data) {
    this.emit('job-event', { jobId, type, ...data });
  }

  /**
   * Nettoyage des vieux jobs (appelé périodiquement)
   */
  async cleanupOldJobs(maxAgeMs = 3600_000) {
    const now = Date.now();
    for (const [jobId, job] of this.#jobs.entries()) {
      if (
        now - job.createdAt > maxAgeMs &&
        job.status !== 'running' &&
        job.status !== 'awaiting_local_worker' &&
        job.status !== 'awaiting_upload'
      ) {
        try {
          if (job.jobDir) await fs.rm(job.jobDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`Échec cleanup job ${jobId}:`, err);
        }
        this.#jobs.delete(jobId);
      }
    }
  }
}
