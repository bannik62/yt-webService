import youtubedl from 'youtube-dl-exec';
import { getCookiesPath } from '../utils/cookiesHelper.js';
import { normalizeUploadDate } from '../utils/uploadDate.js';
import {
  youtubeLangExtractorArg,
  getYtAcceptLanguageHeader,
} from '../utils/ytMetadataLang.js';
import { isValidYoutubeVideoId } from '../sharePage.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const BATCH_MAX_IDS = 15;

/** @type {Map<string, { at: number, value: VideoMeta }>} */
const metaCache = new Map();

/**
 * @typedef {object} VideoMeta
 * @property {string} id
 * @property {string | null} uploadedAt
 * @property {number | null} duration
 * @property {number | null} viewCount
 */

/**
 * @param {string} videoId
 * @returns {string}
 */
function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * @param {Record<string, unknown>} d
 * @returns {VideoMeta | null}
 */
function metaFromDump(d, videoId) {
  if (!d || typeof d !== 'object') return null;
  const id =
    typeof d.id === 'string' && d.id.trim() ? d.id.trim() : videoId;
  const duration =
    typeof d.duration === 'number' && Number.isFinite(d.duration)
      ? d.duration
      : null;
  const viewRaw = d.view_count;
  const viewCount =
    typeof viewRaw === 'number' && Number.isFinite(viewRaw) && viewRaw >= 0
      ? Math.floor(viewRaw)
      : null;

  return {
    id,
    uploadedAt: normalizeUploadDate(d),
    duration,
    viewCount,
  };
}

/**
 * @param {string} videoId
 * @param {{ proxyUrl?: string | null }} [opts]
 * @returns {Promise<VideoMeta>}
 */
export async function fetchVideoMeta(videoId, opts = {}) {
  if (!isValidYoutubeVideoId(videoId)) {
    throw Object.assign(new Error('videoId invalide'), { statusCode: 400 });
  }

  const cached = metaCache.get(videoId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const flags = {
    dumpSingleJson: true,
    skipDownload: true,
    noWarnings: true,
    quiet: true,
    noPlaylist: true,
    extractorArgs: youtubeLangExtractorArg(),
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/',
    addHeader: [`Accept-Language: ${getYtAcceptLanguageHeader()}`],
  };

  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    flags.cookies = cookiesPath;
  }

  const proxyUrl = opts.proxyUrl ?? null;
  if (proxyUrl) {
    flags.proxy = proxyUrl;
  }

  let data;
  try {
    data = await youtubedl(watchUrl(videoId), flags);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(msg || 'Métadonnées indisponibles'), {
      statusCode: 502,
    });
  }

  const meta = metaFromDump(data, videoId) ?? {
    id: videoId,
    uploadedAt: null,
    duration: null,
    viewCount: null,
  };

  metaCache.set(videoId, { at: Date.now(), value: meta });
  return meta;
}

/**
 * @param {string[]} ids
 * @param {{ proxyUrl?: string | null }} [opts]
 * @returns {Promise<{ items: VideoMeta[] }>}
 */
export async function fetchVideoMetaBatch(ids, opts = {}) {
  const unique = [
    ...new Set(
      ids
        .filter((id) => typeof id === 'string' && isValidYoutubeVideoId(id))
        .map((id) => id.trim())
    ),
  ].slice(0, BATCH_MAX_IDS);

  /** @type {VideoMeta[]} */
  const items = [];

  for (const id of unique) {
    const cached = metaCache.get(id);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      items.push(cached.value);
      continue;
    }
    try {
      const meta = await fetchVideoMeta(id, opts);
      items.push(meta);
    } catch {
      items.push({
        id,
        uploadedAt: null,
        duration: null,
        viewCount: null,
      });
    }
  }

  return { items };
}

export { BATCH_MAX_IDS };
