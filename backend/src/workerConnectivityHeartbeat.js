/**
 * Ping périodique GET {WORKER_LOCAL_URL}/health pour alimenter workerIngestGate
 * (`recordWorkerHealthy`). Aucune journalisation ligne à ligne pour ne pas spammer les logs prod.
 *
 * Démarre seulement si WORKER_INGEST_MAX_IDLE_MS > 0 (garde ingest active ; défaut code 900_000 ms).
 * Intervalle : WORKER_INGEST_PING_INTERVAL_MS (défaut 30_000 ms).
 *
 * Les changements garde fermée ↔ ouverte gardent une trace courte (warn/info `ingest_gate`).
 *
 * @param {import('fastify').FastifyInstance} fastify
 */

import {
  recordWorkerHealthy,
  checkWorkerIngestGate,
  isWorkerIngestGateOpen
} from './workerIngestGate.js';

export function startWorkerConnectivityHeartbeat(fastify) {
  const base = process.env.WORKER_LOCAL_URL?.trim().replace(/\/$/, '');
  if (!base) return;

  const idleRaw =
    process.env.WORKER_INGEST_MAX_IDLE_MS === undefined ||
    process.env.WORKER_INGEST_MAX_IDLE_MS === ''
      ? '900000'
      : process.env.WORKER_INGEST_MAX_IDLE_MS;
  const maxIdleMs = Number(idleRaw);
  const gateActive =
    Number.isFinite(maxIdleMs) && maxIdleMs > 0 ? true : false;

  if (!gateActive) return;

  const guardPingRaw = process.env.WORKER_INGEST_PING_INTERVAL_MS;
  const guardPingMs =
    guardPingRaw !== undefined && guardPingRaw !== ''
      ? Number(guardPingRaw)
      : 30000;

  const intervalMs =
    Number.isFinite(guardPingMs) && guardPingMs > 0 ? guardPingMs : 60000;

  /** @type {boolean | null} */
  let prevGateOpen = null;

  const tick = async () => {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(8000)
      });
      await res.json().catch(() => ({}));
      if (res.ok) {
        recordWorkerHealthy();
      }
    } catch {
      /* injoignable : pas de log périodique */
    }

    const gateNow = isWorkerIngestGateOpen();
    const decisionIfClosed = gateNow ? null : checkWorkerIngestGate();

    if (
      prevGateOpen === true &&
      gateNow === false &&
      decisionIfClosed?.blocked &&
      decisionIfClosed.code === 'WORKER_INGEST_STALE'
    ) {
      fastify.log.warn(
        {
          tag: 'ingest_gate',
          transitioned: 'open_to_blocked_stale'
        },
        `[ingest] Ingest désactivée : aucun health worker OK depuis plus de ${Math.round(maxIdleMs / 60000)} min (worker éteint, tunnel coupé ou réseau). Les routes /api/worker/* renvoient 503 jusqu’à retour du health.`
      );
    }

    if (prevGateOpen === false && gateNow === true) {
      fastify.log.info(
        { tag: 'ingest_gate', transitioned: 'blocked_to_open' },
        `[ingest] Ingest réactivée — health worker de nouveau disponible (${base}).`
      );
    }

    prevGateOpen = gateNow;
  };

  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
