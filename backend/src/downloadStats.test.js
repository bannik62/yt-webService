import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { readDownloadStats, incrementDownloadStats } = await import(
  './downloadStats.js'
);

describe('downloadStats (fichier temporaire)', () => {
  /** @type {string} */
  let tmpFile;
  /** @type {string | undefined} */
  let savedPath;

  beforeEach(async () => {
    savedPath = process.env.DOWNLOAD_STATS_PATH;
    tmpFile = path.join(
      os.tmpdir(),
      `yt-stats-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.DOWNLOAD_STATS_PATH = tmpFile;
  });

  afterEach(async () => {
    if (savedPath === undefined) delete process.env.DOWNLOAD_STATS_PATH;
    else process.env.DOWNLOAD_STATS_PATH = savedPath;
    try {
      await fs.unlink(tmpFile);
    } catch {
      /* absent */
    }
  });

  it('fichier absent → compteurs à zéro', async () => {
    const s = await readDownloadStats();
    expect(s).toEqual({
      totalJobs: 0,
      totalFiles: 0,
      updatedAt: '',
    });
  });

  it('incrementDownloadStats persiste jobs et fichiers', async () => {
    await incrementDownloadStats({ files: 3 });
    const s = await readDownloadStats();
    expect(s.totalJobs).toBe(1);
    expect(s.totalFiles).toBe(3);
    expect(s.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await incrementDownloadStats({ files: 1 });
    const s2 = await readDownloadStats();
    expect(s2.totalJobs).toBe(2);
    expect(s2.totalFiles).toBe(4);
  });
});
