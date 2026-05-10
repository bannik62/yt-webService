import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getCorsOptions } from './corsOptions.js';
import { SearchEngine } from './search/SearchEngine.js';

/** Défaut 4000 pour éviter le conflit avec un autre service sur 3000 en local */
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const searchEngine = new SearchEngine({
  maxResults: Number(process.env.SEARCH_MAX_RESULTS) || 10,
  ytDlpPath: process.env.YT_DLP_PATH
});

const app = Fastify({ logger: true });

await app.register(cors, getCorsOptions());

app.get('/health', async () => ({ ok: true }));

app.get('/api/search', async (request, reply) => {
  const q = request.query.q;
  try {
    const payload = await searchEngine.search(
      typeof q === 'string' ? q : ''
    );
    return payload;
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number(
            /** @type {{ statusCode?: number }} */ (err).statusCode
          ) || 500
        : 500;
    const message =
      err instanceof Error ? err.message : 'Erreur recherche';
    reply.status(status).send({ error: message });
  }
});

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
