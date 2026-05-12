/**
 * Logs périodiques : ping GET {WORKER_LOCAL_URL}/health (même logique que /api/worker-local/health).
 *
 * - WORKER_CONNECTIVITY_LOG_MS : intervalle en ms ; absent ou vide = pas de ligne info/warn systématique (les transitions garde-ingest gardent une trace).
 * - WORKER_LOCAL_URL : depuis l’API **dans Docker**, utiliser
 *   `http://host.docker.internal:7410` (+ `extra_hosts` dans compose) pour atteindre le tunnel
 *   sur l’hôte VPS ; `http://127.0.0.1:7410` ne marche que si Node tourne hors conteneur.
 *
 * Garde ingest : voir workerIngestGate.js (WORKER_INGEST_MAX_IDLE_MS, WORKER_INGEST_PING_INTERVAL_MS).
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
  if (!base) {
    return;
  }

  const logRaw = process.env.WORKER_CONNECTIVITY_LOG_MS;
  let logMs = 0;
  if (logRaw !== undefined && logRaw !== '') {
    const n = Number(logRaw);
    if (Number.isFinite(n) && n > 0) logMs = n;
  }

  const idleRaw =
    process.env.WORKER_INGEST_MAX_IDLE_MS === undefined ||
    process.env.WORKER_INGEST_MAX_IDLE_MS === ''
      ? '900000'
      : process.env.WORKER_INGEST_MAX_IDLE_MS;
  const maxIdleMs = Number(idleRaw);
  const gateActive =
    Number.isFinite(maxIdleMs) && maxIdleMs > 0 ? true : false;

  const guardPingRaw = process.env.WORKER_INGEST_PING_INTERVAL_MS;
  const guardPingMs =
    guardPingRaw !== undefined && guardPingRaw !== ''
      ? Number(guardPingRaw)
      : 30000;

  let intervalMs = 0;
  if (gateActive && logMs > 0) {
    intervalMs =
      guardPingMs > 0 ? Math.min(logMs, guardPingMs) : logMs;
  } else if (gateActive) {
    intervalMs =
      Number.isFinite(guardPingMs) && guardPingMs > 0 ? guardPingMs : 60000;
  } else if (logMs > 0) {
    intervalMs = logMs;
  }

  if (!intervalMs || intervalMs <= 0) return;

  const wantLogs = logMs > 0;

  /** @type {boolean | null} null = pas encore après le 1ᵉ ping (évite faux « réactivée » au boot) */
  let prevGateOpen = null;

  const tick = async () => {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(8000)
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        recordWorkerHealthy();
        if (wantLogs) {
          fastify.log.info(
            {
              tag: 'connectivity',
              target: 'worker',
              ok: true,
              status: res.status,
              url: base
            },
            `[connectivity] worker OK (${res.status}) ${base}`
          );
        }
      } else if (wantLogs) {
        fastify.log.warn(
          {
            tag: 'connectivity',
            target: 'worker',
            ok: false,
            status: res.status,
            url: base,
            body
          },
          `[connectivity] worker HTTP ${res.status} ${base}`
        );
      }
    } catch (err) {
      if (wantLogs) {
        fastify.log.warn(
          {
            tag: 'connectivity',
            target: 'worker',
            ok: false,
            url: base,
            err: err instanceof Error ? err.message : String(err)
          },
          `[connectivity] worker injoignable ${base}`
        );
      }
    }

    if (!gateActive) return;

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

  fastify.log.info(
    `[connectivity] ping worker GET ${base}/health toutes les ${intervalMs} ms${wantLogs ? ' (+ logs CONNECTIVITY)' : ''}${gateActive ? ` ; garde ingest si idle > ${maxIdleMs} ms` : ''}.`
  );

  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
