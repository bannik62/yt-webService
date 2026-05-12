/** Erreur proxy type WebShare quota / Payment Required détectée côté yt-dlp ou probe. */
export class ProxyQuotaError extends Error {
  /** @readonly */
  code = 'WORKER_PROXY_402';

  constructor(message = '') {
    super(message);
    this.name = 'ProxyQuotaError';
  }
}

/** Time-out en attente d'un relay worker (après proxy 402) — aucun ingest reçu. */
export class DelegationTimedOutError extends Error {
  /** @readonly */
  code = 'WORKER_LOCAL_DELEGATION_TIMEOUT';

  constructor(message = '') {
    super(message);
    this.name = 'DelegationTimedOutError';
  }
}

/**
 * Détecte 402 Payment Required / erreurs tunnel quota (aligné probe.js).
 * @param {string} combined
 */
export function isProxyQuotaMessage(combined) {
  const s = String(combined ?? '');
  return /402|Payment Required|tunnel connection failed/i.test(s);
}
