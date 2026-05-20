const STORAGE_KEY = 'ytAnonStatsId';

/** @type {string} */
let ephemeralFallbackId = '';

function newFallbackId() {
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Identifiant anonyme stable (localStorage) pour stats agrégées.
 * @returns {string}
 */
export function getOrCreateAnonStatsId() {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9._-]{8,128}$/.test(existing)) {
      return existing;
    }
    const id =
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : newFallbackId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    if (!ephemeralFallbackId) ephemeralFallbackId = newFallbackId();
    return ephemeralFallbackId;
  }
}
