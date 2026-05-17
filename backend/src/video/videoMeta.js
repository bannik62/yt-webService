import youtubedl from 'youtube-dl-exec';
import { getCookiesPath } from '../utils/cookiesHelper.js';
import { normalizeUploadDate } from '../utils/uploadDate.js';
import {
  youtubeLangExtractorArg,
  getYtAcceptLanguageHeader,
} from '../utils/ytMetadataLang.js';
import { isValidYoutubeVideoId } from '../sharePage.js';
import { sanitizeDescriptionForDisplay } from '../utils/descriptionSanitize.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const YTDLP_TIMEOUT_MS = 20_000;

/** @type {Map<string, { at: number, value: VideoMetaPayload }>} */
const metaCache = new Map();

/**
 * @typedef {object} VideoMetaPayload
 * @property {string} id
 * @property {string | null} uploadedAt
 * @property {number | null} duration
 * @property {number | null} viewCount
 * @property {string | null} channel
 * @property {string | null} descriptionPreview
 * @property {boolean} available — false si yt-dlp n’a rien fourni d’exploitable
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
 * @param {string} videoId
 * @returns {VideoMetaPayload}
 */
function metaFromDump(d, videoId) {
  if (!d || typeof d !== 'object') {
    return emptyMeta(videoId, false);
  }

  const duration =
    typeof d.duration === 'number' && Number.isFinite(d.duration) && d.duration >= 0
      ? Math.floor(d.duration)
      : null;
  const viewRaw = d.view_count;
  const viewCount =
    typeof viewRaw === 'number' && Number.isFinite(viewRaw) && viewRaw >= 0
      ? Math.floor(viewRaw)
      : null;
  const channelRaw = d.uploader ?? d.channel ?? d.artist;
  const channel =
    channelRaw != null && String(channelRaw).trim()
      ? String(channelRaw).trim()
      : null;

  const uploadedAt = normalizeUploadDate(d);
  const descriptionPreview = sanitizeDescriptionForDisplay(d.description, {
    aggressive: false,
  });

  const hasAny =
    uploadedAt != null ||
    duration != null ||
    viewCount != null ||
    channel != null ||
    descriptionPreview != null;

  return {
    id: typeof d.id === 'string' && d.id.trim() ? d.id.trim() : videoId,
    uploadedAt,
    duration,
    viewCount,
    channel,
    descriptionPreview,
    available: hasAny,
  };
}

/**
 * @param {string} videoId
 * @param {boolean} available
 * @returns {VideoMetaPayload}
 */
function emptyMeta(videoId, available) {
  return {
    id: videoId,
    uploadedAt: null,
    duration: null,
    viewCount: null,
    channel: null,
    descriptionPreview: null,
    available,
  };
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms = YTDLP_TIMEOUT_MS) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('yt-dlp timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Métadonnées d’une vidéo (lecteur modal) — IP serveur, pas de proxy WebShare.
 * @param {string} videoId
 * @returns {Promise<VideoMetaPayload>}
 */
export async function fetchVideoMeta(videoId) {
  const id = typeof videoId === 'string' ? videoId.trim() : '';
  if (!isValidYoutubeVideoId(id)) {
    throw Object.assign(new Error('videoId invalide'), { statusCode: 400 });
  }

  const cached = metaCache.get(id);
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

  let data;
  try {
    data = await withTimeout(youtubedl(watchUrl(id), flags));
  } catch {
    const fallback = emptyMeta(id, false);
    metaCache.set(id, { at: Date.now(), value: fallback });
    return fallback;
  }

  const meta = metaFromDump(data, id);
  metaCache.set(id, { at: Date.now(), value: meta });
  return meta;
}
