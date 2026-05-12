/**
 * Logs périodiques : ping GET {WORKER_LOCAL_URL}/health (même logique que /api/worker-local/health).
 *
 * - WORKER_CONNECTIVITY_LOG_MS : intervalle en ms ; absent ou vide = désactivé (pas de bruit en prod).
 * - WORKER_LOCAL_URL : depuis l’API **dans Docker**, utiliser
 *   `http://host.docker.internal:7410` (+ `extra_hosts` dans compose) pour atteindre le tunnel
 *   sur l’hôte VPS ; `http://127.0.0.1:7410` ne marche que si Node tourne hors conteneur.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export function startWorkerConnectivityHeartbeat(fastify) {
  const raw = process.env.WORKER_CONNECTIVITY_LOG_MS;
  if (raw === undefined || raw === '') return;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return;

  const tick = async () => {
    const base = process.env.WORKER_LOCAL_URL?.trim().replace(/\/$/, '');
    if (!base) {
      fastify.log.info(
        '[connectivity] worker: WORKER_LOCAL_URL non défini — pas de ping'
      );
      return;
    }
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(8000)
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
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
      } else {
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
  };

  fastify.log.info(
    `[connectivity] heartbeat worker toutes les ${ms} ms (WORKER_CONNECTIVITY_LOG_MS)`
  );
  void tick();
  setInterval(() => {
    void tick();
  }, ms);
}
