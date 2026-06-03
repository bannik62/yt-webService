import { describe, it, expect } from '@jest/globals';
import {
  buildTrendingQuery,
  YOUTUBERS_FR,
  CREATOR_QUERY_CHANCE,
} from './trendingQueryBuilder.js';

const VALID_SOURCES = new Set(['composed', 'creator', 'pattern', 'fallback', 'shorts']);

describe('buildTrendingQuery', () => {
  it('retourne une requête non vide (≥ 2 mots)', () => {
    const { query } = buildTrendingQuery(false);
    expect(query.length).toBeGreaterThan(0);
    expect(query.split(/\s+/).length).toBeGreaterThanOrEqual(2);
    expect(query.length).toBeLessThanOrEqual(80);
  });

  it('génère des phrases différentes sur plusieurs tirages', () => {
    const seen = new Set();
    for (let i = 0; i < 25; i++) {
      seen.add(buildTrendingQuery(false).query);
      seen.add(buildTrendingQuery(true).query);
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it('source valide', () => {
    for (let i = 0; i < 50; i++) {
      const r = buildTrendingQuery(false);
      expect(VALID_SOURCES.has(r.source)).toBe(true);
      expect(r.subject).toBeTruthy();
    }
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
    for (let i = 0; i < 60; i++) {
      if (musicSubjects.has(buildTrendingQuery(true).subject)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });

  it('requête sans [object Object] (modificateur pondéré = string)', () => {
    for (let i = 0; i < 100; i++) {
      const { query } = buildTrendingQuery(false);
      expect(query).not.toContain('[object Object]');
      expect(typeof query).toBe('string');
    }
  });

  it('mode shorts produit source shorts', () => {
    let hit = false;
    for (let i = 0; i < 40; i++) {
      const r = buildTrendingQuery(false, true);
      if (r.source === 'shorts' && /shorts/i.test(r.query)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });

  it('évite de sur-utiliser rare / oublié / underground comme modificateur', () => {
    const niche = new Set(['rare', 'oublié', 'underground']);
    let nicheCount = 0;
    const n = 120;
    for (let i = 0; i < n; i++) {
      const { modifier } = buildTrendingQuery(false);
      if (niche.has(modifier)) nicheCount += 1;
    }
    expect(nicheCount / n).toBeLessThan(0.55);
  });

  it('peut produire un pattern discovery (subject + rare ou discovery)', () => {
    let patternHit = false;
    for (let i = 0; i < 80; i++) {
      const r = buildTrendingQuery(false);
      if (r.source === 'pattern' && r.pattern) {
        patternHit = true;
        break;
      }
    }
    expect(patternHit).toBe(true);
  });
});
