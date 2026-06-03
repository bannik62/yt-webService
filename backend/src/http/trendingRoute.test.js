import Fastify from 'fastify';
import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';

const mockGetTrending = jest.fn();

jest.unstable_mockModule('../ripper/probe.js', () => ({
  getTrending: (...args) => mockGetTrending(...args),
  probePlaylistCount: jest.fn(),
  buildProbeApiShape: jest.fn(),
}));

const { getTrending } = await import('../ripper/probe.js');

/**
 * Mini-app : même contrat que GET /api/trending dans index.js (sans rate-limit).
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildTrendingTestApp() {
  const app = Fastify({ logger: false });

  app.get('/api/trending', async (request, reply) => {
    const maxResults = Number(request.query.limit) || 20;
    const shortsOnly = request.query.shortsOnly === 'true';
    const musicOnly = !shortsOnly && request.query.musicOnly === 'true';

    const proxyIndexRaw = request.query.proxyIndex;
    let proxyUrl = null;
    if (
      proxyIndexRaw !== undefined &&
      proxyIndexRaw !== null &&
      proxyIndexRaw !== ''
    ) {
      const n = Number(proxyIndexRaw);
      if (!Number.isInteger(n)) {
        return reply.status(400).send({ error: 'proxyIndex doit être un entier' });
      }
      proxyUrl = n === 0 ? 'http://mock-proxy:1' : null;
    }

    try {
      return await getTrending(maxResults, musicOnly, { proxyUrl, shortsOnly });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erreur tendances';
      return reply.status(500).send({ error: message });
    }
  });

  await app.ready();
  return app;
}

describe('GET /api/trending (inject, mock getTrending)', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;

  beforeEach(async () => {
    mockGetTrending.mockReset();
    app = await buildTrendingTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 + payload items/keyword', async () => {
    mockGetTrending.mockResolvedValue({
      items: [{ id: 'dQw4w9WgXcQ', title: 'T' }],
      keyword: 'test query',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/trending?limit=10&musicOnly=false',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.keyword).toBe('test query');
    expect(body.items).toHaveLength(1);
    expect(mockGetTrending).toHaveBeenCalledWith(10, false, {
      proxyUrl: null,
      shortsOnly: false,
    });
  });

  it('shortsOnly prioritaire sur musicOnly', async () => {
    mockGetTrending.mockResolvedValue({ items: [], keyword: 'rap shorts' });

    await app.inject({
      method: 'GET',
      url: '/api/trending?shortsOnly=true&musicOnly=true',
    });

    expect(mockGetTrending).toHaveBeenCalledWith(20, false, {
      proxyUrl: null,
      shortsOnly: true,
    });
  });

  it('proxyIndex invalide → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/trending?proxyIndex=abc',
    });
    expect(res.statusCode).toBe(400);
    expect(mockGetTrending).not.toHaveBeenCalled();
  });

  it('getTrending en erreur → 500', async () => {
    mockGetTrending.mockRejectedValue(new Error('Impossible de récupérer les tendances'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/trending',
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain('tendances');
  });
});
