const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * ID vidéo depuis ?v= ou #v= (secours si un client perd la query au redirect).
 * @returns {string | null}
 */
export function getShareVideoIdFromLocation() {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('v');
    if (fromQuery && VIDEO_ID_RE.test(fromQuery)) return fromQuery;

    const raw = window.location.hash.replace(/^#/, '').trim();
    if (!raw) return null;

    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    const fromHashParam = params.get('v');
    if (fromHashParam && VIDEO_ID_RE.test(fromHashParam)) return fromHashParam;

    const m = /^v=([a-zA-Z0-9_-]{11})$/.exec(raw);
    if (m) return m[1];

    if (VIDEO_ID_RE.test(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}
