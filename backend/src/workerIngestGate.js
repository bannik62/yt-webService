/**
 * Garde l’ingestion /api/worker/* : désactive après WORKER_INGEST_MAX_IDLE_MS
 * sans succès GET {WORKER_LOCAL_URL}/health (worker éteint / tunnel coupé).
 *
 * WORKER_LOCAL_URL vide : pas de garde (ingest inchangée).
 * WORKER_INGEST_MAX_IDLE_MS absent → 900_000 ms (15 min). 0 = désactive la garde.
 */

let lastHealthyAt = null;

export function recordWorkerHealthy() {
  lastHealthyAt = Date.now();
}

/** @typedef {{ blocked: false } | { blocked: true; message: string; code: string; logReason: string }} IngestGateResult */

/** @returns {IngestGateResult} */
export function checkWorkerIngestGate() {
  const base = process.env.WORKER_LOCAL_URL?.trim().replace(/\/$/, '');
  if (!base) {
    return { blocked: false };
  }

  const raw = process.env.WORKER_INGEST_MAX_IDLE_MS;
  const maxIdle =
    raw === undefined || raw === ''
      ? 900_000
      : Number(raw);

  if (!Number.isFinite(maxIdle) || maxIdle <= 0) {
    return { blocked: false };
  }

  if (lastHealthyAt == null) {
    return {
      blocked: true,
      message:
        'Ingest désactivée : le worker local n’a pas encore répondu au health check depuis le redémarrage de l’API (WORKER_LOCAL_URL).',
      code: 'WORKER_INGEST_UNAVAILABLE',
      logReason: 'never_reached_since_boot'
    };
  }

  const age = Date.now() - lastHealthyAt;
  if (age > maxIdle) {
    const min = Math.round(maxIdle / 60_000);
    return {
      blocked: true,
      message: `Ingest désactivée : aucune réponse du worker (${base}/health) depuis plus de ${min} min — machine locale éteinte, tunnel SSH interrompu, ou problème Docker/réseau sur le VPS.`,
      code: 'WORKER_INGEST_STALE',
      logReason: `stale_health ageMs=${age}`
    };
  }

  return { blocked: false };
}

/** @returns {boolean} */
export function isWorkerIngestGateOpen() {
  return !checkWorkerIngestGate().blocked;
}
