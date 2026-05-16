import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { EventEmitter } from 'node:events';

const mockSpawnImpl = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  spawn: (...args) => mockSpawnImpl(...args),
}));

const { SearchEngine } = await import('./SearchEngine.js');

function makeChildProcess(stdoutChunks, stderrText, closeCode) {
  const child = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  queueMicrotask(() => {
    for (const chunk of stdoutChunks) {
      stdout.emit('data', Buffer.from(chunk));
    }
    if (stderrText) stderr.emit('data', Buffer.from(stderrText));
    child.emit('close', closeCode);
  });
  child.stdout = stdout;
  child.stderr = stderr;
  return child;
}

beforeEach(() => {
  mockSpawnImpl.mockReset();
});

describe('SearchEngine.listChannelVideos', () => {
  test('utilise l’URL onglet vidéos de la chaîne', async () => {
    const line = JSON.stringify({
      id: 'vid1',
      title: 'Stream 1',
      channel: 'Gotaga',
      channel_id: 'UC1234567890abcdefghij',
      duration: 120,
    });
    mockSpawnImpl.mockReturnValue(makeChildProcess([`${line}\n`], '', 0));

    const engine = new SearchEngine({ maxResults: 10, ytDlpPath: '/fake/yt-dlp' });
    const result = await engine.listChannelVideos({
      channelId: 'UC1234567890abcdefghij',
      channelName: 'Gotaga',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].channel).toBe('Gotaga');
    expect(mockSpawnImpl).toHaveBeenCalledWith(
      '/fake/yt-dlp',
      expect.arrayContaining([
        'https://www.youtube.com/channel/UC1234567890abcdefghij/videos',
        '--flat-playlist',
      ]),
      expect.any(Object)
    );
    expect(mockSpawnImpl.mock.calls[0][1].join(' ')).not.toContain('ytsearch');
  });
});
