import { spawn } from 'node:child_process';
import { youtubeLangExtractorArg } from '../utils/ytMetadataLang.js';

const DEFAULT_MAX = 10;
const QUERY_MAX_LEN = 500;

const ALLOWED_YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);

/**
 * Moteur de recherche : configuration sur l'instance, résultats en variables locales
 * (plusieurs GET /api/search en parallèle ne partagent pas de tableaux mutables).
 */
export class SearchEngine {
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

    const normalizedItems = await this.#runYtDlpSearch(q);

    return {
      query: q,
      items: normalizedItems.map((item) => ({ ...item }))
    };
  }

  /**
   * Texte libre → recherche `ytsearchN:…` ; URL YouTube autorisée → URL brute pour yt-dlp.
   * @param {string} q
   * @returns {{ type: 'search'; value: string } | { type: 'url'; value: string }}
   */
  #resolveTarget(q) {
    const trimmed = q.trim();
    const looksLikeUrl = /^https?:\/\//i.test(trimmed);
    if (!looksLikeUrl) {
      return { type: 'search', value: trimmed };
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw Object.assign(new Error('URL invalide'), { statusCode: 400 });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw Object.assign(new Error('Schéma non autorisé'), { statusCode: 400 });
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_YT_HOSTS.has(host)) {
      throw Object.assign(
        new Error('Seules les URLs YouTube / youtu.be sont acceptées'),
        { statusCode: 400 }
      );
    }
    return { type: 'url', value: trimmed };
  }

  /**
   * @param {string} q
   * @returns {Promise<import('./types.js').NormalizedItem[]>}
   */
  async #runYtDlpSearch(q) {
    const target = this.#resolveTarget(q);
    const entry =
      target.type === 'search'
        ? `ytsearch${this.#maxResults}:${target.value}`
        : target.value;

    const args = [
      entry,
      '-j',
      '--no-download',
      '--flat-playlist',
      '--playlist-end',
      String(this.#maxResults),
      '--no-warnings',
      '--quiet',
      '--extractor-args',
      youtubeLangExtractorArg()
    ];

    const { stdout, stderr, code } = await this.#spawnYtDlp(args);
    if (code !== 0 && !stdout.trim()) {
      const err = new Error(
        stderr.trim() || `yt-dlp a échoué (code ${code})`
      );
      err.statusCode = 502;
      throw err;
    }

    const rawJsonLines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return rawJsonLines.length > 0
      ? this.#parseAndNormalize(rawJsonLines)
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

  /**
   * @param {string[]} rawJsonLines
   * @returns {import('./types.js').NormalizedItem[]}
   */
  #parseAndNormalize(rawJsonLines) {
    /** @type {import('./types.js').NormalizedItem[]} */
    const out = [];
    for (const line of rawJsonLines) {
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
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.id)}`,
        thumbnail: row.thumbnail || `https://i.ytimg.com/vi/${row.id}/mqdefault.jpg`
      });
      if (out.length >= this.#maxResults) break;
    }
    return out;
  }
}
