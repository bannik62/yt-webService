const STORAGE_KEY = 'ytWorkerSessionId';

/** Mémoïse si storage indisponible (même valeur pour la durée du chargement du module). */
let ephemeralFallbackId = '';

function newFallbackId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Identifiant de session navigateur stable par onglet (délégation worker / replay local).
 * @returns {string}
 */
export function getOrCreateWorkerSessionId() {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9._-]{8,128}$/.test(existing)) {
      return existing;
    }
    const id =
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : newFallbackId();
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    if (!ephemeralFallbackId) ephemeralFallbackId = newFallbackId();
    return ephemeralFallbackId;
  }
}
