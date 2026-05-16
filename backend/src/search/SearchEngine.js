import { spawn } from 'node:child_process';
import { youtubeLangExtractorArg } from '../utils/ytMetadataLang.js';
import { normalizeUploadDate } from '../utils/uploadDate.js';
import {
  resolveChannelVideosUrl,
  channelNamesMatch,
} from './channelVideos.js';

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
   * Vidéos de l'onglet « Vidéos » d'une chaîne (pas une recherche texte globale).
   * @param {{ channelId?: string, channelUrl?: string, channelName?: string }} opts
   * @returns {Promise<{ query: string, channelId: string | null, channelName: string | null, items: import('./types.js').PublicItem[] }>}
   */
  async listChannelVideos(opts = {}) {
    const channelId =
      typeof opts.channelId === 'string' ? opts.channelId.trim() : '';
    const channelName =
      typeof opts.channelName === 'string' ? opts.channelName.trim() : '';
    const channelUrl =
      typeof opts.channelUrl === 'string' ? opts.channelUrl.trim() : '';

    let resolvedId = channelId;
    let resolvedUrl = channelUrl;
    let tabUrl = resolveChannelVideosUrl({
      channelId: resolvedId || null,
      channelUrl: resolvedUrl || null,
    });

    if (!tabUrl && channelName) {
      const resolved = await this.#resolveChannelIdFromName(channelName);
      resolvedId = resolved.channelId || resolvedId;
      resolvedUrl = resolved.channelUrl || resolvedUrl;
      tabUrl = resolveChannelVideosUrl({
        channelId: resolvedId || null,
        channelUrl: resolvedUrl || null,
      });
    }

    if (!tabUrl) {
      throw Object.assign(
        new Error(
          'Impossible de cibler cette chaîne. Réessaie depuis une autre vidéo du même créateur.'
        ),
        { statusCode: 400 }
      );
    }

    const rawJsonLines = await this.#runYtDlpArgs([
      tabUrl,
      '-j',
      '--no-download',
      '--flat-playlist',
      '--playlist-end',
      String(this.#maxResults),
      '--no-warnings',
      '--quiet',
      '--extractor-args',
      youtubeLangExtractorArg(),
    ]);

    const items = this.#parseAndNormalize(rawJsonLines, {
      filterChannelId: resolvedId || null,
      filterChannelName: channelName || null,
    });

    return {
      query: channelName || resolvedId || tabUrl,
      channelId: resolvedId || null,
      channelName: channelName || null,
      items,
    };
  }

  /**
   * Dernière chance : une recherche ytsearch1 pour récupérer channel_id.
   * @param {string} channelName
   */
  async #resolveChannelIdFromName(channelName) {
    const name = String(channelName).trim();
    if (!name) return { channelId: null, channelUrl: null };

    const lines = await this.#runYtDlpArgs([
      `ytsearch1:${name}`,
      '-j',
      '--no-download',
      '--flat-playlist',
      '--playlist-end',
      '1',
      '--no-warnings',
      '--quiet',
      '--extractor-args',
      youtubeLangExtractorArg(),
    ]);

    if (lines.length === 0) {
      return { channelId: null, channelUrl: null };
    }

    let row;
    try {
      row = JSON.parse(lines[0]);
    } catch {
      return { channelId: null, channelUrl: null };
    }

    const item = this.#rowToItem(row);
    if (!item?.channelId && !channelNamesMatch(item?.channel, name)) {
      return { channelId: null, channelUrl: null };
    }

    return {
      channelId: item.channelId,
      channelUrl: item.channelUrl,
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

    const rawJsonLines = await this.#runYtDlpArgs([
      entry,
      '-j',
      '--no-download',
      '--playlist-end',
      String(this.#maxResults),
      '--no-warnings',
      '--quiet',
      '--extractor-args',
      youtubeLangExtractorArg(),
    ]);
    return rawJsonLines.length > 0 ? this.#parseAndNormalize(rawJsonLines) : [];
  }

  /**
   * @param {string[]} args
   * @returns {Promise<string[]>}
   */
  async #runYtDlpArgs(args) {
    const { stdout, stderr, code } = await this.#spawnYtDlp(args);
    if (code !== 0 && !stdout.trim()) {
      const err = new Error(
        stderr.trim() || `yt-dlp a échoué (code ${code})`
      );
      err.statusCode = 502;
      throw err;
    }
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
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
   * @param {{ filterChannelId?: string | null, filterChannelName?: string | null }} [filter]
   * @returns {import('./types.js').NormalizedItem[]}
   */
  #parseAndNormalize(rawJsonLines, filter = {}) {
    const { filterChannelId, filterChannelName } = filter;
    /** @type {import('./types.js').NormalizedItem[]} */
    const out = [];
    for (const line of rawJsonLines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const item = this.#rowToItem(row);
      if (!item) continue;

      if (filterChannelId) {
        if (item.channelId && item.channelId !== filterChannelId) continue;
      } else if (
        filterChannelName &&
        !channelNamesMatch(item.channel, filterChannelName)
      ) {
        continue;
      }

      out.push(item);
      if (out.length >= this.#maxResults) break;
    }
    return out;
  }

  /**
   * @param {Record<string, unknown>} row
   * @returns {import('./types.js').NormalizedItem | null}
   */
  #rowToItem(row) {
    if (!row || typeof row.id !== 'string' || !row.title) return null;

    const channelIdRaw =
      row.channel_id ?? row.uploader_id ?? row.channelid ?? null;
    const channelId =
      channelIdRaw != null && String(channelIdRaw).trim()
        ? String(channelIdRaw).trim()
        : null;

    const channelUrlRaw = row.channel_url ?? row.uploader_url ?? null;
    const channelUrl =
      channelUrlRaw != null && String(channelUrlRaw).trim()
        ? String(channelUrlRaw).trim()
        : null;

    const channel =
      row.channel != null
        ? String(row.channel)
        : row.uploader != null
          ? String(row.uploader)
          : null;

    return {
      id: row.id,
      title: String(row.title),
      channel,
      channelId,
      channelUrl,
      duration: typeof row.duration === 'number' ? row.duration : null,
      uploadedAt: normalizeUploadDate(row),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.id)}`,
      thumbnail:
        (typeof row.thumbnail === 'string' && row.thumbnail) ||
        `https://i.ytimg.com/vi/${row.id}/mqdefault.jpg`,
    };
  }
}
