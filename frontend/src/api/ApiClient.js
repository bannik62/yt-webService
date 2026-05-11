/**
 * Client API centralisé
 */
export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
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
   * Probe une URL (playlist/vidéo)
   * @param {object} params
   * @returns {Promise<object>}
   */
  async probe({ url, noPlaylist, maxDownloads }) {
    try {
      const res = await fetch(`${this.baseUrl}/api/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, noPlaylist, maxDownloads }),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${res.status})`);
      }
      
      return await res.json();
    } catch (err) {
      this._handleFetchError(err, 'analyse');
    }
  }

  /**
   * Lance un téléchargement MP3
   * @param {object} params
   * @returns {Promise<{jobId: string}>}
   */
  async startDownload({ url, noPlaylist, maxDownloads }) {
    try {
      const res = await fetch(`${this.baseUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, noPlaylist, maxDownloads }),
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
   * @returns {Promise<{jobId: string}>}
   */
  async startBatchDownload(urls) {
    try {
      const res = await fetch(`${this.baseUrl}/api/download-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
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
