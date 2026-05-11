const STORAGE_KEY = 'yt-proxy-index';

/**
 * Index du proxy WebShare choisi par l'utilisateur (persisté navigateur).
 * @returns {number | undefined}
 */
export function getStoredProxyIndex() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isInteger(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {number} index
 */
export function setStoredProxyIndex(index) {
  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    /* ignore */
  }
}
