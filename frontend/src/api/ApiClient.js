/**
 * Client API centralisé
 */
export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Recherche YouTube
   * @param {string} query
   * @returns {Promise<{query: string, items: Array}>}
   */
  async search(query) {
    const url = `${this.baseUrl}/api/search?${new URLSearchParams({ q: query })}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(120_000)
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Erreur ${res.status}`);
    }
    
    return await res.json();
  }

  /**
   * Probe une URL (playlist/vidéo)
   * @param {object} params
   * @returns {Promise<object>}
   */
  async probe({ url, noPlaylist, maxDownloads }) {
    const res = await fetch(`${this.baseUrl}/api/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, noPlaylist, maxDownloads })
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Erreur ${res.status}`);
    }
    
    return await res.json();
  }

  /**
   * Lance un téléchargement MP3
   * @param {object} params
   * @returns {Promise<{jobId: string}>}
   */
  async startDownload({ url, noPlaylist, maxDownloads }) {
    const res = await fetch(`${this.baseUrl}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, noPlaylist, maxDownloads })
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Erreur ${res.status}`);
    }
    
    return await res.json();
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
