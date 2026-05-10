/**
 * CORS sûr : en production, seules les origines listées dans CORS_ORIGIN
 * sont autorisées. En dev (NODE_ENV≠production), localhost / 127.0.0.1
 * sont autorisés pour les appels directs navigateur → API (sans proxy Vite).
 *
 * Avec le proxy Vite en local, le navigateur parle uniquement à :5173 :
 * pas de requête cross-origin vers l’API pour le navigateur, donc pas de CORS
 * côté navigateur — le proxy Node relaie en serveur→serveur.
 */

/**
 * @returns {import('@fastify/cors').FastifyCorsOptions}
 */
export function getCorsOptions() {
  const explicit = process.env.CORS_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isProd = process.env.NODE_ENV === 'production';
  const strictDev = process.env.CORS_STRICT === '1';

  return {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      if (explicit?.length) {
        cb(null, explicit.includes(origin));
        return;
      }

      if (!isProd && !strictDev) {
        try {
          const u = new URL(origin);
          const local =
            u.hostname === 'localhost' ||
            u.hostname === '127.0.0.1' ||
            u.hostname === '[::1]';
          if (local && (u.protocol === 'http:' || u.protocol === 'https:')) {
            cb(null, true);
            return;
          }
        } catch {
          cb(null, false);
          return;
        }
      }

      cb(null, false);
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}
