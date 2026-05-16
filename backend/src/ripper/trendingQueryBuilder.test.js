import { describe, it, expect } from '@jest/globals';
import {
  buildTrendingQuery,
  YOUTUBERS_FR,
  CREATOR_QUERY_CHANCE,
} from './trendingQueryBuilder.js';

describe('buildTrendingQuery', () => {
  it('compose trois mots en une phrase', () => {
    const { query, subject, verb, modifier } = buildTrendingQuery(false);
    expect(query).toBe(`${subject} ${verb} ${modifier}`);
    expect(query.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  it('génère des phrases différentes sur plusieurs tirages', () => {
    const seen = new Set();
    for (let i = 0; i < 25; i++) {
      seen.add(buildTrendingQuery(false).query);
      seen.add(buildTrendingQuery(true).query);
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it('expose la liste des créateurs FR', () => {
    expect(YOUTUBERS_FR).toContain('squeezie');
    expect(YOUTUBERS_FR).toContain('gotaga');
    expect(YOUTUBERS_FR.length).toBeGreaterThanOrEqual(50);
  });

  it('tirage créateur ~10% (mock)', () => {
    const originalRandom = Math.random;
    let calls = 0;
    Math.random = () => {
      calls += 1;
      return calls === 1 ? 0.05 : 0.99;
    };
    try {
      const r = buildTrendingQuery(false);
      expect(r.source).toBe('creator');
      expect(YOUTUBERS_FR).toContain(r.query);
    } finally {
      Math.random = originalRandom;
    }
    expect(CREATOR_QUERY_CHANCE).toBe(0.1);
  });

  it('mode musique utilise des sujets musicaux', () => {
    const musicSubjects = new Set([
      'jazz',
      'rap',
      'clip',
      'live',
      'album',
      'chanson',
      'électro',
      'folk',
    ]);
    let hit = false;
    for (let i = 0; i < 30; i++) {
      if (musicSubjects.has(buildTrendingQuery(true).subject)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });
});
