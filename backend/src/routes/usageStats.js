import {
  getUsageStatsSummary,
  recordUsageEvent,
  validateUsageEvent
} from '../usageStats.js';

/** @param {import('fastify').FastifyInstance} fastify */
export default async function usageStatsRoutes(fastify) {
  fastify.post(
    '/event',
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== 'object') {
        return reply.status(400).send({ error: 'Corps JSON attendu' });
      }

      const check = validateUsageEvent(body);
      if (!check.ok) {
        return reply.status(400).send({ error: check.error });
      }

      const result = await recordUsageEvent({
        anonId: body.anonId,
        videoId: body.videoId,
        channelId: body.channelId,
        channelName: body.channelName,
        title: body.title
      });

      return { ok: true, recorded: result.recorded };
    }
  );

  fastify.get(
    '/summary',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute'
        }
      }
    },
    async (request) => {
      const q = request.query || {};
      return getUsageStatsSummary({
        days: q.days,
        limit: q.limit
      });
    }
  );
}
