import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
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
      url,
      noPlaylist,
      maxDownloads,
      ip,
      status: 'queued',
      logs: [],
      progress: { filePct: 0, itemIndex: 1, itemTotal: 1 },
      createdAt: Date.now(),
      jobDir,
      zipPath: null,
      error: null
    };

    this.#jobs.set(jobId, job);
    this.#queue.push(jobId);
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
    this.#emitJobEvent(jobId, 'status', { status: 'running' });

    try {
      await fs.mkdir(job.jobDir, { recursive: true });

      await runDownload({
        url: job.url,
        targetDir: job.jobDir,
        noPlaylist: job.noPlaylist,
        maxDownloads: job.maxDownloads || 0,
        onLog: (line) => {
          job.logs.push(line);
          this.#emitJobEvent(jobId, 'log', { line });
        },
        onProgress: (progress) => {
          job.progress = progress;
          this.#emitJobEvent(jobId, 'progress', { progress });
        }
      });

      const zipPath = await this.#createZip(jobId, job.jobDir);
      job.zipPath = zipPath;
      job.status = 'completed';
      this.#emitJobEvent(jobId, 'complete', { 
        success: true, 
        downloadUrl: `/api/jobs/${jobId}/download` 
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

  async #createZip(jobId, jobDir) {
    const zipPath = path.join(this.#tempDir, `${jobId}.zip`);
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve(zipPath));
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.directory(jobDir, false);
      archive.finalize();
    });
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
          if (job.zipPath) await fs.rm(job.zipPath, { force: true });
        } catch (err) {
          console.error(`Échec cleanup job ${jobId}:`, err);
        }
        this.#jobs.delete(jobId);
      }
    }
  }
}
