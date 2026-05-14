import { randomUUID } from 'node:crypto';
import { isProxyQuotaMessage } from './proxyQuotaError.js';
import {
  interpretYtdlpProbeDump,
  buildProbeApiShape
} from './probe.js';

/**
 * @returns {number}
 */
function delegationFallbackWaitMs() {
  const raw = process.env.WORKER_LOCAL_DELEGATION_WAIT_MS;
  if (raw === undefined || raw === '') return 90000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 3000 ? n : 90000;
}

/**
 * @param {unknown} err
 * @param {{ hadProxy: boolean, workerSessionId: string }} ctx
 * @returns {boolean}
 */
export function shouldDelegateProbeToWorker(err, { hadProxy, workerSessionId }) {
  const sid =
    typeof workerSessionId === 'string' ? workerSessionId.trim() : '';
  if (!hadProxy || sid.length === 0) return false;
  const probeTxt = `${err?.message ?? ''}\n${err?.cause?.message ?? ''}`;
  return isProxyQuotaMessage(probeTxt);
}

/**
 * @typedef {{
 *   probeId: string;
 *   url: string;
 *   noPlaylist: boolean;
 *   maxDownloads: unknown;
 *   state: 'pending' | 'dispatched' | 'complete' | 'failed';
 *   waitTimeoutId: ReturnType<typeof setTimeout> | null;
 *   dispatchTimeoutId: ReturnType<typeof setTimeout> | null;
 *   createdAt: number;
 *   result: ReturnType<typeof buildProbeApiShape> | null;
 *   error: string | null;
 * }} ProbeDelegationEntry
 */

/** @type {Map<string, ProbeDelegationEntry>} */
const entries = new Map();

/**
 * @param {{ url: string, noPlaylist: boolean, maxDownloads: unknown }} p
 * @returns {string} probeId
 */
export function enqueueProbeDelegation({ url, noPlaylist, maxDownloads }) {
  const probeId = randomUUID();
  /** @type {ProbeDelegationEntry} */
  const entry = {
    probeId,
    url: String(url || '').trim(),
    noPlaylist: Boolean(noPlaylist),
    maxDownloads,
    state: 'pending',
    waitTimeoutId: null,
    dispatchTimeoutId: null,
    createdAt: Date.now(),
    result: null,
    error: null
  };
  entry.waitTimeoutId = setTimeout(() => {
    failProbeDelegation(probeId, 'Time-out : aucun worker n’a pris l’analyse (même fenêtre que le relais téléchargement).');
  }, delegationFallbackWaitMs());
  entries.set(probeId, entry);
  return probeId;
}

/**
 * @param {string} probeId
 * @param {string} message
 */
function failProbeDelegation(probeId, message) {
  const e = entries.get(probeId);
  if (!e || (e.state !== 'pending' && e.state !== 'dispatched')) return;
  if (e.waitTimeoutId) {
    clearTimeout(e.waitTimeoutId);
    e.waitTimeoutId = null;
  }
  if (e.dispatchTimeoutId) {
    clearTimeout(e.dispatchTimeoutId);
    e.dispatchTimeoutId = null;
  }
  e.state = 'failed';
  e.error = message;
}

/**
 * Priorité avant les jobs `awaiting_local_worker` : tâches probe courtes.
 * @returns {{ kind: 'probe', probeId: string, url: string, noPlaylist: boolean } | null}
 */
export function claimNextProbeRelayTask() {
  let best = /** @type {ProbeDelegationEntry | null} */ (null);
  for (const e of entries.values()) {
    if (e.state !== 'pending') continue;
    if (!best || e.createdAt < best.createdAt) best = e;
  }
  if (!best) return null;

  if (best.waitTimeoutId) {
    clearTimeout(best.waitTimeoutId);
    best.waitTimeoutId = null;
  }
  best.state = 'dispatched';
  best.dispatchTimeoutId = setTimeout(() => {
    failProbeDelegation(
      best.probeId,
      'Time-out worker après prise de tâche analyse (pas de POST complete).'
    );
  }, delegationFallbackWaitMs());

  return {
    kind: 'probe',
    probeId: best.probeId,
    url: best.url,
    noPlaylist: best.noPlaylist
  };
}

/**
 * @param {string} probeId
 * @returns {{ state: string } & Record<string, unknown> | null}
 */
export function getProbeDelegationStatus(probeId) {
  const e = entries.get(probeId);
  if (!e) return null;
  if (e.state === 'pending') return { state: 'pending' };
  if (e.state === 'dispatched') return { state: 'dispatched' };
  if (e.state === 'complete' && e.result) {
    return { state: 'complete', ...e.result };
  }
  if (e.state === 'failed') {
    return { state: 'failed', ok: false, error: e.error || 'Échec analyse relais' };
  }
  return { state: e.state };
}

/**
 * @param {string} probeId
 * @param {{ ok: boolean, dump?: unknown, error?: string }} body
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function completeProbeDelegationFromWorker(probeId, body) {
  const e = entries.get(probeId);
  if (!e) {
    return { ok: false, error: 'probeId inconnu' };
  }
  if (e.state !== 'dispatched') {
    return {
      ok: false,
      error: `Analyse pas en attente de complétion (état: ${e.state})`
    };
  }

  if (e.dispatchTimeoutId) {
    clearTimeout(e.dispatchTimeoutId);
    e.dispatchTimeoutId = null;
  }

  const ok = Boolean(body?.ok);
  if (!ok) {
    const errMsg =
      typeof body?.error === 'string' && body.error.trim()
        ? body.error.trim().slice(0, 4000)
        : 'Worker : analyse refusée';
    e.state = 'failed';
    e.error = errMsg;
    return { ok: true };
  }

  let dump = body?.dump;
  if (typeof dump === 'string') {
    try {
      dump = JSON.parse(dump);
    } catch {
      e.state = 'failed';
      e.error = 'JSON dump invalide (worker)';
      return { ok: true };
    }
  }
  if (!dump || typeof dump !== 'object') {
    e.state = 'failed';
    e.error = 'Champ dump manquant ou invalide';
    return { ok: true };
  }

  try {
    const probe = interpretYtdlpProbeDump(dump);
    e.result = buildProbeApiShape(probe, e.noPlaylist, e.maxDownloads);
    e.state = 'complete';
    e.error = null;
    return { ok: true };
  } catch (err) {
    e.state = 'failed';
    e.error = err instanceof Error ? err.message : String(err);
    return { ok: true };
  }
}
