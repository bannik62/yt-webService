import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const {
  recordUsageEvent,
  getUsageStatsSummary,
  dedupKey,
  validateUsageEvent
} = await import('./usageStats.js');

describe('usageStats', () => {
  /** @type {string} */
  let tmpFile;
  /** @type {string | undefined} */
  let savedPath;

  beforeEach(async () => {
    savedPath = process.env.USAGE_STATS_PATH;
    tmpFile = path.join(
      os.tmpdir(),
      `yt-usage-stats-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.USAGE_STATS_PATH = tmpFile;
  });

  afterEach(async () => {
    if (savedPath === undefined) delete process.env.USAGE_STATS_PATH;
    else process.env.USAGE_STATS_PATH = savedPath;
    try {
      await fs.unlink(tmpFile);
    } catch {
      /* absent */
    }
  });

  it('validateUsageEvent refuse payload invalide', () => {
    expect(validateUsageEvent({ type: 'click', anonId: 'a', videoId: 'b' }).ok).toBe(
      false
    );
    expect(
      validateUsageEvent({
        type: 'video_view',
        anonId: 'short',
        videoId: 'abcdefghijk'
      }).ok
    ).toBe(false);
  });

  it('recordUsageEvent déduplique par jour', async () => {
    const anonId = 'anon-user-12345678';
    const videoId = 'dQw4w9WgXcQ';
    const payload = {
      anonId,
      videoId,
      title: 'Never Gonna Give You Up',
      channelName: 'Rick Astley'
    };

    const r1 = await recordUsageEvent(payload);
    const r2 = await recordUsageEvent(payload);
    expect(r1.recorded).toBe(true);
    expect(r2.recorded).toBe(false);

    const summary = await getUsageStatsSummary({ days: 7, limit: 5 });
    expect(summary.topVideos).toHaveLength(1);
    expect(summary.topVideos[0].views).toBe(1);
    expect(summary.topVideos[0].uniqueViewers).toBe(1);
    expect(summary.topChannels[0].channelName).toBe('Rick Astley');
  });

  it('agrège plusieurs anonId sur la même vidéo', async () => {
    const videoId = 'abcdefghijk';
    await recordUsageEvent({
      anonId: 'anon-user-11111111',
      videoId,
      channelId: 'UC123',
      channelName: 'Chaine A'
    });
    await recordUsageEvent({
      anonId: 'anon-user-22222222',
      videoId,
      channelId: 'UC123',
      channelName: 'Chaine A'
    });

    const summary = await getUsageStatsSummary({ days: 7, limit: 5 });
    expect(summary.topVideos[0].views).toBe(2);
    expect(summary.topVideos[0].uniqueViewers).toBe(2);
    expect(summary.topChannels[0].views).toBe(2);
    expect(summary.topChannels[0].uniqueViewers).toBe(2);
  });

  it('dedupKey inclut la date du jour', () => {
    const d = new Date('2026-05-20T12:00:00.000Z');
    expect(dedupKey('anon-12345678', 'abcdefghijk', d)).toBe(
      'anon-12345678:abcdefghijk:2026-05-20'
    );
  });

  it('limite à 50 et compte les vidéos non affichées', async () => {
    for (let i = 0; i < 55; i++) {
      const videoId = `v${String(i).padStart(10, '0')}`;
      await recordUsageEvent({
        anonId: `anon-user-${String(i).padStart(8, '0')}`,
        videoId,
        title: `Video ${i}`,
        channelName: `Ch ${i}`
      });
    }

    const summary = await getUsageStatsSummary({ days: 7, limit: 50 });
    expect(summary.topVideos).toHaveLength(50);
    expect(summary.totalVideos).toBe(55);
    expect(summary.videosNotShown).toBe(5);
    expect(summary.displayLimit).toBe(50);
  });
});
