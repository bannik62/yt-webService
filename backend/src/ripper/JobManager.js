import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runDownload } from './runDownload.js';

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
   * @returns {string} jobId
   */
  createJob({ url, noPlaylist, maxDownloads, ip }) {
    const jobId = randomUUID();
    const jobDir = path.join(this.#tempDir, jobId);

    const job = {
      id: jobId,
      urls: [url],
      noPlaylist,
      maxDownloads,
      ip,
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
   * @returns {string} jobId
   */
  createBatchJob({ urls, ip }) {
    const jobId = randomUUID();
    const jobDir = path.join(this.#tempDir, jobId);

    const job = {
      id: jobId,
      urls: urls,
      noPlaylist: true, // Toujours single pour batch
      maxDownloads: 10, // Limite à 10 si playlist détectée
      ip,
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

        job.logs.push(`\n=== Traitement ${i + 1}/${job.urls.length}: ${url} ===\n`);
        this.#emitJobEvent(jobId, 'log', { line: `\n=== Traitement ${i + 1}/${job.urls.length} ===` });

        await runDownload({
          url,
          targetDir: job.jobDir,
          noPlaylist: job.noPlaylist,
          maxDownloads: job.maxDownloads || 10, // Limite playlists à 10
          onLog: (line) => {
            job.logs.push(line);
            this.#emitJobEvent(jobId, 'log', { line });
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
      const files = await this.#listDownloadedFiles(jobId, job.jobDir);
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
    } catch (err) {
      job.status = 'failed';
      job.error = err.message || String(err);
      this.#emitJobEvent(jobId, 'complete', {
        success: false,
        error: job.error
      });
    } finally {
      this.#currentJob = null;
      this.#processQueue();
    }
  }

  async #listDownloadedFiles(jobId, jobDir) {
    try {
      const entries = await fs.readdir(jobDir, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.mp3')) {
          const filePath = path.join(jobDir, entry.name);
          const stats = await fs.stat(filePath);
          files.push({
            name: entry.name,
            path: filePath,
            size: stats.size
          });
        }
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
      if (now - job.createdAt > maxAgeMs && job.status !== 'running') {
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
