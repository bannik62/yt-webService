/**
 * Client API centralisé
 */
import { getStoredProxyIndex } from '../utils/proxyPreference.js';
import { getOrCreateWorkerSessionId } from '../utils/workerSession.js';

export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * En-têtes optionnels pour corrélation session navigateur (relai worker futur).
   * @private
   * @returns {Record<string, string>}
   */
  _workerSessionHeaders() {
    try {
      const id = getOrCreateWorkerSessionId();
      if (!id || !/^[a-zA-Z0-9._-]{8,128}$/.test(id)) return {};
      return { 'X-Worker-Session': id };
    } catch {
      return {};
    }
  }

  /**
   * Gère les erreurs fetch de façon détaillée
   * @private
   */
  _handleFetchError(err, context = 'requête') {
    let message = `Erreur ${context} : `;
    
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      message += 'Le serveur ne répond pas (timeout)';
    } else if (err.name === 'TypeError' && !navigator.onLine) {
      message += 'Pas de connexion internet';
    } else if (err.name === 'TypeError') {
      message += 'Impossible de contacter le serveur';
    } else {
      message += err.message;
    }
    
    throw new Error(message);
  }

  /**
   * Recherche YouTube
   * @param {string} query
   * @returns {Promise<{query: string, items: Array}>}
   */
  /**
   * Vidéos de l'onglet « Vidéos » d'une chaîne YouTube (pas recherche globale).
   * @param {{ channelId?: string, channelUrl?: string, channelName?: string }} opts
   */
  /**
   * Métadonnées d’une vidéo (modal lecteur). Ne lance pas d’exception : erreurs → payload partiel.
   * @param {string} videoId
   * @returns {Promise<{
   *   id?: string,
   *   uploadedAt?: string | null,
   *   duration?: number | null,
   *   viewCount?: number | null,
   *   channel?: string | null,
   *   descriptionPreview?: string | null,
   *   available?: boolean,
   *   error?: string
   * }>}
   */
  /**
   * @param {Record<string, unknown>} probe
   * @param {string} videoId
   * @returns {object}
   */
  _probeResultToVideoMeta(probe, videoId) {
    const uploadedAt =
      typeof probe.uploadedAt === 'string' && probe.uploadedAt.trim()
        ? probe.uploadedAt.trim()
        : null;
    const duration =
      typeof probe.durationSeconds === 'number' &&
      Number.isFinite(probe.durationSeconds) &&
      probe.durationSeconds >= 0
        ? Math.floor(probe.durationSeconds)
        : null;
    const viewCount =
      typeof probe.viewCount === 'number' &&
      Number.isFinite(probe.viewCount) &&
      probe.viewCount >= 0
        ? Math.floor(probe.viewCount)
        : null;
    const channel =
      typeof probe.channel === 'string' && probe.channel.trim()
        ? probe.channel.trim()
        : null;
    const descriptionPreview =
      typeof probe.descriptionPreview === 'string' &&
      probe.descriptionPreview.trim()
        ? probe.descriptionPreview.trim()
        : null;

    const hasAny =
      uploadedAt ||
      duration != null ||
      viewCount != null ||
      channel ||
      descriptionPreview;

    return {
      id:
        typeof probe.videoId === 'string' && probe.videoId.trim()
          ? probe.videoId.trim()
          : videoId,
      uploadedAt,
      duration,
      viewCount,
      channel,
      descriptionPreview,
      available: Boolean(hasAny),
    };
  }

  async fetchVideoMeta(videoId, opts = {}) {
    const id = typeof videoId === 'string' ? videoId.trim() : '';
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return { id, available: false, error: 'Identifiant vidéo invalide' };
    }

    const externalSignal = opts.signal;
    const timeoutMs =
      typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
        ? opts.timeoutMs
        : 55_000;

    try {
      const params = new URLSearchParams({ videoId: id });
      const px = getStoredProxyIndex();
      if (px !== undefined) params.set('proxyIndex', String(px));

      const url = `${this.baseUrl}/api/video/meta?${params}`;
      const res = await fetch(url, {
        headers: {
          ...this._workerSessionHeaders(),
        },
        signal: AbortSignal.any([
          AbortSignal.timeout(timeoutMs),
          ...(externalSignal ? [externalSignal] : []),
        ]),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 202 && data.pendingWorkerMeta && data.probeId) {
        const probe = await this._pollProbeDelegation(data.probeId, {
          signal: externalSignal,
          deadlineMs: 50_000,
        });
        return this._probeResultToVideoMeta(probe, id);
      }

      if (!res.ok) {
        return {
          id,
          available: false,
          error: data?.error || `Erreur serveur (${res.status})`,
        };
      }

      return data;
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        return { id, available: false, error: 'Délai dépassé' };
      }
      const msg = err instanceof Error ? err.message : '';
      if (msg) {
        return { id, available: false, error: msg };
      }
      return { id, available: false, error: 'Infos indisponibles' };
    }
  }

  async searchChannelVideos(opts) {
    try {
      const params = new URLSearchParams();
      if (opts.channelId) params.set('channelId', opts.channelId);
      if (opts.channelUrl) params.set('channelUrl', opts.channelUrl);
      if (opts.channelName) params.set('channelName', opts.channelName);
      const url = `${this.baseUrl}/api/channel/videos?${params}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }
      return await res.json();
    } catch (err) {
      this._handleFetchError(err, 'chaîne');
    }
  }

  async search(query) {
    try {
      const url = `${this.baseUrl}/api/search?${new URLSearchParams({ q: query })}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30000)
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }
      
      return await res.json();
    } catch (err) {
      this._handleFetchError(err, 'recherche');
    }
  }

  /**
   * Découverte aléatoire (liste de mots-clés côté serveur)
   * @param {number} limit
   * @param {boolean} musicOnly
   * @returns {Promise<{items: Array, keyword: string}>}
   */
  async getTrending(limit = 20, musicOnly = false) {
    try {
      const params = { limit };
      if (musicOnly) params.musicOnly = 'true';
      const px = getStoredProxyIndex();
      if (px !== undefined) params.proxyIndex = String(px);

      const url = `${this.baseUrl}/api/trending?${new URLSearchParams(params)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30000)
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }
      
      return await res.json();
    } catch (err) {
      this._handleFetchError(err, 'tendances');
    }
  }

  /**
   * Attente résultat analyse déléguée au worker (402 proxy + session navigateur).
   * @param {string} probeId
   * @returns {Promise<object>}
   */
  async _pollProbeDelegation(probeId, opts = {}) {
    const deadlineMs =
      typeof opts.deadlineMs === 'number' && opts.deadlineMs > 0
        ? opts.deadlineMs
        : 120_000;
    const deadline = Date.now() + deadlineMs;
    const externalSignal = opts.signal;
    const pollUrl = `${this.baseUrl}/api/probe-delegation/${encodeURIComponent(probeId)}/status`;
    while (Date.now() < deadline) {
      if (externalSignal?.aborted) {
        throw new DOMException('Annulé', 'AbortError');
      }
      const r = await fetch(pollUrl, {
        signal: AbortSignal.any([
          AbortSignal.timeout(15_000),
          ...(externalSignal ? [externalSignal] : []),
        ]),
      });
      const s = await r.json().catch(() => ({}));
      if (s.state === 'complete' && s.ok === true) {
        /** @type {Record<string, unknown>} */
        const out = {
          ok: true,
          kind: s.kind,
          count: s.count,
          title: s.title,
          effectiveCount: s.effectiveCount
        };
        const extras = [
          'videoId',
          'channel',
          'durationSeconds',
          'durationLabel',
          'thumbnailUrl',
          'webpageUrl',
          'viewCount',
          'uploadedAt',
          'descriptionPreview',
          'sourceMediaKind'
        ];
        for (const k of extras) {
          const v = s[k];
          if (v != null && v !== '') out[k] = v;
        }
        return out;
      }
      if (s.state === 'failed') {
        throw new Error(s.error || 'Échec analyse relais local');
      }
      await new Promise((res) => setTimeout(res, 800));
    }
    throw new Error(
      'Time-out relais local (worker absent ou trop lent). Vérifie serveurLocal.'
    );
  }

  /**
   * Probe une URL (playlist/vidéo)
   * @param {object} params
   * @returns {Promise<object>}
   */
  async probe({ url, noPlaylist, maxDownloads }) {
    try {
      const body = { url, noPlaylist, maxDownloads };
      const px = getStoredProxyIndex();
      if (px !== undefined) body.proxyIndex = px;

      const res = await fetch(`${this.baseUrl}/api/probe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this._workerSessionHeaders()
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 202 && data.pendingWorkerProbe && data.probeId) {
        return await this._pollProbeDelegation(data.probeId);
      }

      if (!res.ok) {
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }

      return data;
    } catch (err) {
      this._handleFetchError(err, 'analyse');
    }
  }

  /**
   * Lance un téléchargement (MP3 ou MP4 selon `output`)
   * @param {object} params
   * @param {'audio' | 'video'} [params.output] — défaut `audio`
   * @returns {Promise<{jobId: string}>}
   */
  async startDownload({ url, noPlaylist, maxDownloads, output = 'audio' }) {
    try {
      const body = { url, noPlaylist, maxDownloads, output };
      const px = getStoredProxyIndex();
      if (px !== undefined) body.proxyIndex = px;

      const res = await fetch(`${this.baseUrl}/api/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this._workerSessionHeaders()
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }
      
      return await res.json();
    } catch (err) {
      this._handleFetchError(err, 'téléchargement');
    }
  }

  /**
   * Lance un téléchargement batch (plusieurs URLs)
   * @param {string[]} urls
   * @param {{ output?: 'audio' | 'video' }} [opts] — défaut `video` (MP4)
   * @returns {Promise<{jobId: string}>}
   */
  async startBatchDownload(urls, opts = {}) {
    try {
      const body = { urls, output: opts.output ?? 'video' };
      const px = getStoredProxyIndex();
      if (px !== undefined) body.proxyIndex = px;

      const res = await fetch(`${this.baseUrl}/api/download-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this._workerSessionHeaders()
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }
      
      return await res.json();
    } catch (err) {
      this._handleFetchError(err, 'téléchargement batch');
    }
  }

  /**
   * Stream SSE pour suivre progression d'un job
   * @param {string} jobId
   * @returns {EventSource}
   */
  streamJob(jobId) {
    return new EventSource(`${this.baseUrl}/api/jobs/${jobId}/stream`);
  }
}
