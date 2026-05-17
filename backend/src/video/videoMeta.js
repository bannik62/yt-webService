import youtubedl from 'youtube-dl-exec';
import { getCurrentProxy } from '../proxy/proxyManager.js';
import { ProxyQuotaError, isProxyQuotaMessage } from '../ripper/proxyQuotaError.js';
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

/** Vide le cache (tests uniquement). */
export function clearVideoMetaCacheForTests() {
  metaCache.clear();
}

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
 * @param {string | null | undefined} proxyUrl
 * @returns {Record<string, unknown>}
 */
function buildYtdlpFlags(proxyUrl) {
  /** @type {Record<string, unknown>} */
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
  if (proxyUrl) {
    flags.proxy = proxyUrl;
  }
  return flags;
}

/**
 * Convertit une réponse probe (relais worker) en payload modal.
 * @param {Record<string, unknown>} probe
 * @param {string} videoId
 * @returns {VideoMetaPayload}
 */
export function videoMetaFromProbeApi(probe, videoId) {
  const id =
    typeof probe.videoId === 'string' && probe.videoId.trim()
      ? probe.videoId.trim()
      : videoId;
  const uploadedAt =
    typeof probe.uploadedAt === 'string' && probe.uploadedAt.trim()
      ? probe.uploadedAt.trim()
      : null;
  const durationRaw = probe.durationSeconds;
  const duration =
    typeof durationRaw === 'number' &&
    Number.isFinite(durationRaw) &&
    durationRaw >= 0
      ? Math.floor(durationRaw)
      : null;
  const viewRaw = probe.viewCount;
  const viewCount =
    typeof viewRaw === 'number' && Number.isFinite(viewRaw) && viewRaw >= 0
      ? Math.floor(viewRaw)
      : null;
  const channelRaw = probe.channel;
  const channel =
    channelRaw != null && String(channelRaw).trim()
      ? String(channelRaw).trim()
      : null;
  const descriptionPreview =
    typeof probe.descriptionPreview === 'string' &&
    probe.descriptionPreview.trim()
      ? probe.descriptionPreview.trim()
      : null;

  const hasAny =
    uploadedAt != null ||
    duration != null ||
    viewCount != null ||
    channel != null ||
    descriptionPreview != null;

  return {
    id,
    uploadedAt,
    duration,
    viewCount,
    channel,
    descriptionPreview,
    available: hasAny,
  };
}

/**
 * Métadonnées d’une vidéo (lecteur modal) — proxy WebShare puis relais worker si 402.
 * @param {string} videoId
 * @param {{ proxyUrl?: string | null }} [opts] — `proxyUrl: null` force sans proxy
 * @returns {Promise<VideoMetaPayload>}
 */
export async function fetchVideoMeta(videoId, opts = {}) {
  const id = typeof videoId === 'string' ? videoId.trim() : '';
  if (!isValidYoutubeVideoId(id)) {
    throw Object.assign(new Error('videoId invalide'), { statusCode: 400 });
  }

  const cached = metaCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const proxyUrl =
    'proxyUrl' in opts ? opts.proxyUrl : getCurrentProxy();

  /**
   * @param {string | null | undefined} proxy
   * @returns {Promise<unknown>}
   */
  const runYtdlp = (proxy) =>
    withTimeout(youtubedl(watchUrl(id), buildYtdlpFlags(proxy)));

  let data;
  try {
    data = await runYtdlp(proxyUrl);
  } catch (firstErr) {
    const msg = `${firstErr instanceof Error ? firstErr.message : firstErr}\n${firstErr && typeof firstErr === 'object' && 'cause' in firstErr && firstErr.cause instanceof Error ? firstErr.cause.message : ''}`;
    if (proxyUrl && isProxyQuotaMessage(msg)) {
      throw new ProxyQuotaError(msg.trim().slice(0, 2048));
    }
    if (proxyUrl) {
      try {
        data = await runYtdlp(undefined);
      } catch {
        const fallback = emptyMeta(id, false);
        metaCache.set(id, { at: Date.now(), value: fallback });
        return fallback;
      }
    } else {
      const fallback = emptyMeta(id, false);
      metaCache.set(id, { at: Date.now(), value: fallback });
      return fallback;
    }
  }

  const meta = metaFromDump(data, id);
  metaCache.set(id, { at: Date.now(), value: meta });
  return meta;
}
