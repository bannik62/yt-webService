import { spawn } from 'node:child_process';

const DEFAULT_MAX = 10;
const QUERY_MAX_LEN = 200;

/**
 * Moteur de recherche : données brutes et état interne restent privés (#).
 * Seules les méthodes publiques exposent des objets plain / sérialisables.
 */
export class SearchEngine {
  /** @type {string | null} */
  #lastQuery = null;
  /** @type {number | null} */
  #lastRunAt = null;
  /** @type {import('./types.js').NormalizedItem[]} */
  #normalizedItems = [];
  /** lignes JSON brutes yt-dlp (ne jamais renvoyer telles quelles au client) */
  #rawJsonLines = [];
  #maxResults;
  /** binaire ou chemin absolu (voir YT_DLP_PATH) */
  #ytDlpBin;

  /**
   * @param {{ maxResults?: number; ytDlpPath?: string }} [opts]
   */
  constructor(opts = {}) {
    this.#maxResults = Math.min(
      Math.max(1, opts.maxResults ?? DEFAULT_MAX),
      25
    );
    const fromOpts =
      typeof opts.ytDlpPath === 'string' ? opts.ytDlpPath.trim() : '';
    const fromEnv = (process.env.YT_DLP_PATH || '').trim();
    this.#ytDlpBin = fromOpts || fromEnv || 'yt-dlp';
  }

  /**
   * Recherche YouTube via yt-dlp (doit être dans PATH sur le serveur).
   * @param {string} query
   * @returns {Promise<{ query: string, items: import('./types.js').PublicItem[] }>}
   */
  async search(query) {
    const q = typeof query === 'string' ? query.trim() : '';
    if (!q) {
      throw Object.assign(new Error('Requête vide'), { statusCode: 400 });
    }
    if (q.length > QUERY_MAX_LEN) {
      throw Object.assign(new Error('Requête trop longue'), {
        statusCode: 400
      });
    }

    this.#lastQuery = q;
    this.#lastRunAt = Date.now();
    await this.#runYtDlpSearch(q);

    return {
      query: q,
      items: this.#publicSnapshot()
    };
  }

  /** Aperçu minimal pour logs / admin sans exposer #rawJsonLines */
  getMeta() {
    return {
      lastQuery: this.#lastQuery,
      lastRunAt: this.#lastRunAt,
      resultCount: this.#normalizedItems.length
    };
  }

  /**
   * Copie défensive des résultats publics (pas de référence aux objets internes).
   */
  #publicSnapshot() {
    return this.#normalizedItems.map((item) => ({ ...item }));
  }

  async #runYtDlpSearch(q) {
    const url = `ytsearch${this.#maxResults}:${q}`;
    const args = [
      url,
      '-j',
      '--no-download',
      '--flat-playlist',
      '--playlist-end',
      String(this.#maxResults),
      '--no-warnings',
      '--quiet'
    ];

    const { stdout, stderr, code } = await this.#spawnYtDlp(args);
    if (code !== 0 && !stdout.trim()) {
      const err = new Error(
        stderr.trim() || `yt-dlp a échoué (code ${code})`
      );
      err.statusCode = 502;
      throw err;
    }

    this.#rawJsonLines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    this.#normalizedItems =
      this.#rawJsonLines.length > 0
        ? this.#parseAndNormalize()
        : [];
  }

  /**
   * @param {string[]} args
   * @returns {Promise<{ stdout: string, stderr: string, code: number | null }>}
   */
  #spawnYtDlp(args) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.#ytDlpBin, args, {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        if (
          err &&
          /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT'
        ) {
          const hint = this.#ytDlpBin.includes('/')
            ? ` (YT_DLP_PATH=${this.#ytDlpBin})`
            : '';
          reject(
            Object.assign(
              new Error(
                `yt-dlp introuvable (« ${this.#ytDlpBin} »)${hint}. ` +
                  'Installez yt-dlp + ffmpeg dans le PATH, définissez YT_DLP_PATH vers le binaire, ' +
                  'ou déployez avec backend/Dockerfile.'
              ),
              { statusCode: 500 }
            )
          );
          return;
        }
        reject(err);
      });
      child.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });
    });
  }

  #parseAndNormalize() {
    /** @type {import('./types.js').NormalizedItem[]} */
    const out = [];
    for (const line of this.#rawJsonLines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (!row || typeof row.id !== 'string' || !row.title) continue;
      out.push({
        id: row.id,
        title: String(row.title),
        channel: row.channel ? String(row.channel) : null,
        duration: typeof row.duration === 'number' ? row.duration : null,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.id)}`
      });
      if (out.length >= this.#maxResults) break;
    }
    return out;
  }
}
