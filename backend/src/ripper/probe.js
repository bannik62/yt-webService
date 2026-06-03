import youtubedl from 'youtube-dl-exec';
import { getCurrentProxy } from '../proxy/proxyManager.js';
import { getCookiesPath, hasCookies } from '../utils/cookiesHelper.js';
import { buildTrendingQuery } from './trendingQueryBuilder.js';
import { normalizeUploadDate } from '../utils/uploadDate.js';
import { sanitizeDescriptionForDisplay } from '../utils/descriptionSanitize.js';
import {
  youtubeLangExtractorArg,
  getYtAcceptLanguageHeader
} from '../utils/ytMetadataLang.js';
import { normalizePlaylistMaxDownloads } from './playlistLimit.js';

/**
 * @param {unknown} sec
 * @returns {string | null}
 */
function formatDurationLabel(sec) {
  if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return null;
  const s = Math.floor(Number(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function toNonNegativeFiniteNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function pickNonEmptyString(v) {
  if (v == null || typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

/**
 * @param {object} d
 * @returns {string | null}
 */
function pickThumbnailUrl(d) {
  const tryUrl = (u) => {
    const s = pickNonEmptyString(u);
    if (!s) return null;
    if (s.startsWith('https://') || s.startsWith('http://')) return s;
    if (s.startsWith('//')) return `https:${s}`;
    return null;
  };
  const direct = tryUrl(d?.thumbnail);
  if (direct) return direct;
  const thumbs = d?.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const u = thumbs[thumbs.length - 1]?.url;
    const out = tryUrl(u);
    if (out) return out;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function clipDescriptionPreview(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const one = raw.replace(/\s+/g, ' ').trim();
  if (!one) return null;
  return one.length > 240 ? `${one.slice(0, 237)}…` : one;
}

/**
 * Chaîne / auteur affichable (YouTube standard, clips « artiste », etc.).
 * @param {object} d
 * @returns {string | null}
 */
function pickChannelLabel(d) {
  const up = pickNonEmptyString(d.uploader);
  const ch = pickNonEmptyString(d.channel);
  if (up && ch && up.toLowerCase() !== ch.toLowerCase()) {
    return `${up} (${ch})`;
  }
  if (up) return up;
  if (ch) return ch;
  const artist = pickNonEmptyString(d.artist);
  const track = pickNonEmptyString(d.track);
  if (artist && track) return `${artist} — ${track}`;
  if (artist) return artist;
  return null;
}

/**
 * @param {object} d
 * @returns {'video' | 'audio' | null}
 */
function inferSourceMediaKind(d) {
  if (!d || typeof d !== 'object') return null;
  const vc = String(d.vcodec || '').toLowerCase();
  if (vc && vc !== 'none') return 'video';
  const w = toNonNegativeFiniteNumber(d.width);
  const h = toNonNegativeFiniteNumber(d.height);
  if (w != null && h != null && w > 0 && h > 0) return 'video';
  const ac = String(d.acodec || '').toLowerCase();
  if (ac && ac !== 'none') return 'audio';
  return null;
}

/**
 * Métadonnées communes extraites d’un objet yt-dlp (vidéo ou conteneur playlist).
 * @param {object} d
 * @returns {Record<string, unknown>}
 */
function metaFromYtdlpDict(d) {
  if (!d || typeof d !== 'object') return {};
  const durationSeconds = toNonNegativeFiniteNumber(d.duration);
  const durationLabel =
    formatDurationLabel(durationSeconds) ||
    pickNonEmptyString(d.duration_string);
  const channel = pickChannelLabel(d);
  const rawId = pickNonEmptyString(d.id);
  const videoId =
    rawId && /^[\w-]{6,}$/.test(rawId) ? rawId : null;
  const viewCountRaw = toNonNegativeFiniteNumber(d.view_count);
  const viewCount =
    viewCountRaw != null ? Math.floor(viewCountRaw) : null;
  const webpage = pickNonEmptyString(d.webpage_url);
  const webpageUrl =
    webpage && (webpage.startsWith('http://') || webpage.startsWith('https://'))
      ? webpage
      : null;
  return {
    videoId,
    channel,
    durationSeconds,
    durationLabel,
    thumbnailUrl: pickThumbnailUrl(d),
    webpageUrl,
    viewCount,
    uploadedAt: normalizeUploadDate(d),
    descriptionPreview:
      sanitizeDescriptionForDisplay(d.description, { aggressive: false }) ??
      clipDescriptionPreview(d.description),
    sourceMediaKind: inferSourceMediaKind(d)
  };
}

/**
 * Interprète le JSON yt-dlp (`--dump-single-json` / `dumpSingleJson`).
 * @param {object} data
 * @returns {object}
 */
export function interpretYtdlpProbeDump(data) {
  if (data && Array.isArray(data.entries) && data.entries.length > 0) {
    const meta = metaFromYtdlpDict(data);
    return {
      kind: 'playlist',
      count: data.entries.length,
      title: data.title || '',
      ...meta
    };
  }
  if (data && data.id) {
    return {
      kind: 'single',
      count: 1,
      title: data.title || '',
      ...metaFromYtdlpDict(data)
    };
  }
  return {
    kind: 'unknown',
    count: 1,
    title: (data && data.title) || '',
    ...metaFromYtdlpDict(data && typeof data === 'object' ? data : {})
  };
}

/** @type {string[]} */
const PROBE_OPTIONAL_API_KEYS = [
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

/**
 * @param {object} probe
 * @param {boolean} noPlaylist
 * @param {unknown} maxDownloads
 * @returns {object}
 */
export function buildProbeApiShape(probe, noPlaylist, maxDownloads) {
  let effectiveCount = probe.count;
  if (Boolean(noPlaylist)) {
    effectiveCount = 1;
  } else {
    const limit = normalizePlaylistMaxDownloads(false, maxDownloads);
    effectiveCount = Math.min(probe.count, limit);
  }
  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    kind: probe.kind,
    count: probe.count,
    title: probe.title,
    effectiveCount
  };
  for (const k of PROBE_OPTIONAL_API_KEYS) {
    const v = probe[k];
    if (v != null && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Erreurs de tunnel HTTP(S) côté proxy (crédits, auth, refus).
 * @param {unknown} err
 */
function isLikelyProxyTunnelFailure(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /402|403|407|Payment Required|Tunnel connection failed|ProxyError|urlopen error/i.test(
    msg
  );
}

/** @param {unknown} err @param {unknown} [proxyErr] */
function buildTrendingError(err, proxyErr) {
  const e = err instanceof Error ? err.message : String(err);
  const p = proxyErr instanceof Error ? proxyErr.message : '';
  if (/402|Payment Required/i.test(p) || /402|Payment Required/i.test(e)) {
    return new Error(
      'Proxy : 402 Payment Required (souvent quotas WebShare épuisés). Choisis un autre proxy, désactive la sélection proxy, ou vérifie ton abonnement. Sans proxy, l’IP du serveur peut être bloquée par YouTube.'
    );
  }
  return new Error('Impossible de récupérer les tendances');
}

/**
 * Probe une URL YouTube pour déterminer le nombre de morceaux
 * @param {string} url
 * @param {object} options
 * @param {boolean} options.noPlaylist
 * @returns {Promise<object>}
 */
export async function probePlaylistCount(url, { noPlaylist, proxyUrl: proxyOverride } = {}) {
  const proxyUrl = proxyOverride ?? getCurrentProxy();
  
  console.log('[probe] Analyse URL:', url);
  console.log('[probe] noPlaylist:', noPlaylist);
  if (hasCookies()) {
    console.log('[probe] 🍪 Cookies: activés');
  }
  if (proxyUrl) {
    console.log('[probe] 🌐 Proxy: activé');
  }
  
  const flags = {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    extractorArgs: youtubeLangExtractorArg(),
    // Mêmes headers que pour le téléchargement (Chrome 2026)
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/',
    addHeader: [`Accept-Language: ${getYtAcceptLanguageHeader()}`]
  };
  
  // Utiliser les cookies si disponibles
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    flags.cookies = cookiesPath;
  }
  
  // Utiliser un proxy si configuré
  if (proxyUrl) {
    flags.proxy = proxyUrl;
  }
  
  if (noPlaylist) flags.noPlaylist = true;

  const data = await youtubedl(url, flags);
  console.log('[probe] Résultat:', data ? `${data.entries?.length || 1} item(s)` : 'vide');

  const shaped = interpretYtdlpProbeDump(data);
  if (shaped.kind === 'playlist') {
    console.log('[probe] Type: playlist avec', shaped.count, 'items');
  } else if (shaped.kind === 'single') {
    console.log('[probe] Type: single video');
  } else {
    console.log('[probe] Type: unknown/fallback');
  }
  return { ...shaped };
}

/**
 * Mélange Fisher–Yates (ordre YouTube trop prévisible sinon).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffleItems(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Découverte via recherche YouTube (mot-clé aléatoire)
 * @param {number} maxResults
 * @param {boolean} musicOnly
 * @returns {Promise<{items: Array, keyword: string}>}
 */
/** @param {number | null | undefined} duration */
function isShortDuration(duration) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return null;
  return d <= 60;
}

export async function getTrending(maxResults = 20, musicOnly = false, opts = {}) {
  const requestedProxyUrl = opts.proxyUrl ?? getCurrentProxy();
  const shortsOnly = Boolean(opts.shortsOnly);

  const { query: searchTerm } = buildTrendingQuery(
    musicOnly && !shortsOnly,
    shortsOnly
  );
  const searchQuery = `ytsearch${maxResults}:${searchTerm}`;

  console.log('[trending] Musique uniquement:', musicOnly && !shortsOnly);
  console.log('[trending] Shorts uniquement:', shortsOnly);
  console.log('[trending] Mot-clé:', searchTerm);
  console.log('[trending] Recherche:', searchQuery);
  if (requestedProxyUrl) {
    console.log('[trending] 🌐 Proxy: activé');
  }

  const baseFlags = {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    extractorArgs: youtubeLangExtractorArg(),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/',
    addHeader: [`Accept-Language: ${getYtAcceptLanguageHeader()}`]
  };

  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    baseFlags.cookies = cookiesPath;
  }

  const runSearch = async (proxyForRequest) => {
    const flags = { ...baseFlags };
    if (proxyForRequest) {
      flags.proxy = proxyForRequest;
    }
    return youtubedl(searchQuery, flags);
  };

  let data;
  try {
    data = await runSearch(requestedProxyUrl);
  } catch (firstErr) {
    if (requestedProxyUrl && isLikelyProxyTunnelFailure(firstErr)) {
      console.warn(
        '[trending] Échec via proxy, nouvel essai sans proxy:',
        firstErr instanceof Error ? firstErr.message : firstErr
      );
      try {
        data = await runSearch(undefined);
      } catch (secondErr) {
        console.error(
          '[trending] Erreur (sans proxy):',
          secondErr instanceof Error ? secondErr.message : secondErr
        );
        throw buildTrendingError(secondErr, firstErr);
      }
    } else {
      console.error(
        '[trending] Erreur:',
        firstErr instanceof Error ? firstErr.message : firstErr
      );
      throw buildTrendingError(firstErr, null);
    }
  }

  if (!data || !Array.isArray(data.entries)) {
    console.log('[trending] Aucune entrée trouvée');
    return { items: [], keyword: searchTerm };
  }

  const items = data.entries
    .filter((entry) => {
      if (!entry || !entry.id) return false;
      const short = isShortDuration(entry.duration);
      if (shortsOnly) {
        return short !== false;
      }
      return short !== true;
    })
    .map((entry) => {
      let thumbnail = null;
      if (entry.thumbnail) {
        thumbnail = entry.thumbnail;
      } else if (entry.thumbnails && entry.thumbnails.length > 0) {
        const best = entry.thumbnails[entry.thumbnails.length - 1];
        thumbnail = best.url;
      } else {
        thumbnail = `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`;
      }

      const channelIdRaw = entry.channel_id ?? entry.uploader_id ?? null;
      const channelId =
        channelIdRaw != null && String(channelIdRaw).trim()
          ? String(channelIdRaw).trim()
          : null;
      const channelUrlRaw = entry.channel_url ?? entry.uploader_url ?? null;
      const channelUrl =
        channelUrlRaw != null && String(channelUrlRaw).trim()
          ? String(channelUrlRaw).trim()
          : null;

      const duration = entry.duration || 0;
      const shortFlag = shortsOnly || isShortDuration(duration) === true;

      return {
        id: entry.id,
        title: entry.title || 'Sans titre',
        url: `https://www.youtube.com/watch?v=${entry.id}`,
        thumbnail: thumbnail,
        duration,
        channel: entry.uploader || entry.channel || '—',
        channelId,
        channelUrl,
        uploadedAt: normalizeUploadDate(entry),
        isShort: shortFlag,
      };
    });

  const shuffled = shuffleItems(items);
  console.log('[trending] Résultat:', shuffled.length, 'vidéos (mélangées)');
  return { items: shuffled, keyword: searchTerm };
}
