/**
 * URL onglet « Vidéos » d'une chaîne YouTube pour yt-dlp.
 * @param {{ channelId?: string | null, channelUrl?: string | null, uploaderUrl?: string | null }} opts
 * @returns {string | null}
 */
export function resolveChannelVideosUrl(opts) {
  const raw =
    (typeof opts.channelUrl === 'string' && opts.channelUrl.trim()) ||
    (typeof opts.uploaderUrl === 'string' && opts.uploaderUrl.trim()) ||
    '';

  if (raw) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (
        host === 'youtube.com' ||
        host === 'www.youtube.com' ||
        host === 'm.youtube.com'
      ) {
        return appendVideosTab(u);
      }
    } catch {
      /* ignore */
    }
  }

  const id =
    typeof opts.channelId === 'string' ? opts.channelId.trim() : '';
  if (/^UC[\w-]{10,}$/i.test(id)) {
    return `https://www.youtube.com/channel/${id}/videos`;
  }

  return null;
}

/**
 * @param {URL} u
 * @returns {string}
 */
function appendVideosTab(u) {
  let path = u.pathname.replace(/\/+$/, '');
  if (path.endsWith('/videos') || path.endsWith('/streams') || path.endsWith('/shorts')) {
    return u.toString();
  }
  if (/^\/@[^/]+$/i.test(path) || /^\/channel\/[^/]+$/i.test(path) || /^\/c\/[^/]+$/i.test(path)) {
    return `${u.origin}${path}/videos`;
  }
  if (/^\/user\/[^/]+$/i.test(path)) {
    return `${u.origin}${path}/videos`;
  }
  return u.toString();
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
export function channelNamesMatch(a, b) {
  if (!a || !b) return false;
  const na = String(a).trim().toLowerCase();
  const nb = String(b).trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb;
}
