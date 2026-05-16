import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { EventEmitter } from 'node:events';

const mockSpawnImpl = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  spawn: (...args) => mockSpawnImpl(...args)
}));

const { SearchEngine } = await import('./SearchEngine.js');

/**
 * Mimique stdout/stderr d’un yt-dlp -j ligne par ligne puis close.
 */
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

describe('SearchEngine.search validation', () => {
  test('requête vide → 400', async () => {
    const engine = new SearchEngine();
    await expect(engine.search('   ')).rejects.toMatchObject({
      message: 'Requête vide',
      statusCode: 400
    });
    expect(mockSpawnImpl).not.toHaveBeenCalled();
  });

  test('requête trop longue → 400', async () => {
    const engine = new SearchEngine();
    const q = 'a'.repeat(501);
    await expect(engine.search(q)).rejects.toMatchObject({
      message: 'Requête trop longue',
      statusCode: 400
    });
    expect(mockSpawnImpl).not.toHaveBeenCalled();
  });

  test('chaîne commence par https mais URL invalide → 400', async () => {
    const engine = new SearchEngine();
    await expect(engine.search('https://')).rejects.toMatchObject({
      message: 'URL invalide',
      statusCode: 400
    });
    expect(mockSpawnImpl).not.toHaveBeenCalled();
  });

  test('host interdit → 400', async () => {
    const engine = new SearchEngine();
    await expect(engine.search('https://evil.example/v')).rejects.toMatchObject({
      message: 'Seules les URLs YouTube / youtu.be sont acceptées',
      statusCode: 400
    });
    expect(mockSpawnImpl).not.toHaveBeenCalled();
  });

  test('URL YouTube courte youtu.be acceptée pour yt-dlp', async () => {
    mockSpawnImpl.mockReturnValue(makeChildProcess([''], '', 0));
    const engine = new SearchEngine({ maxResults: 5 });
    const url = 'https://youtu.be/abc123XYZ';
    const result = await engine.search(url);

    expect(result.query).toBe(url);
    expect(result.items).toEqual([]);
    expect(mockSpawnImpl).toHaveBeenCalledTimes(1);
    const [, args] = mockSpawnImpl.mock.calls[0];
    expect(args[0]).toBe(url);
    expect(args.join(' ')).not.toContain('ytsearch');
  });
});

describe('SearchEngine.search + yt-dlp mock', () => {
  test('texte libre → ytsearchN et normalisation JSON', async () => {
    const line = JSON.stringify({
      id: 'dQw4w9WgXcQ',
      title: '  Test titre  ',
      channel: 'Chaîne',
      duration: 212,
      upload_date: '20240315',
    });
    mockSpawnImpl.mockReturnValue(makeChildProcess([`${line}\n`], '', 0));

    const engine = new SearchEngine({ maxResults: 10, ytDlpPath: '/fake/yt-dlp' });
    const result = await engine.search('rick roll');

    expect(result.query).toBe('rick roll');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 'dQw4w9WgXcQ',
      title: '  Test titre  ',
      channel: 'Chaîne',
      channelId: null,
      channelUrl: null,
      duration: 212,
      uploadedAt: '2024-03-15',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
    });

    expect(mockSpawnImpl).toHaveBeenCalledWith(
      '/fake/yt-dlp',
      expect.arrayContaining([
        'ytsearch10:rick roll',
        '-j',
        '--extractor-args',
        expect.stringMatching(/^youtube:lang=/)
      ]),
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
    );
  });

  test('lignes JSON invalides ignorées', async () => {
    const good = JSON.stringify({ id: 'x', title: 'OK' });
    mockSpawnImpl.mockReturnValue(
      makeChildProcess(['not json\n', `${good}\n`], '', 0)
    );

    const engine = new SearchEngine({ maxResults: 10 });
    const result = await engine.search('foo');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('x');
  });

  test('code ≠ 0 et stdout vide → 502', async () => {
    mockSpawnImpl.mockReturnValue(makeChildProcess([''], 'network error', 1));
    const engine = new SearchEngine();
    await expect(engine.search('query')).rejects.toMatchObject({
      message: 'network error',
      statusCode: 502
    });
  });

  test('code ≠ 0 mais stdout non vide → parse quand même (comportement actuel)', async () => {
    const line = JSON.stringify({ id: 'y', title: 'T' });
    mockSpawnImpl.mockReturnValue(makeChildProcess([`${line}\n`], 'warn', 1));
    const engine = new SearchEngine();
    const result = await engine.search('q');
    expect(result.items).toHaveLength(1);
  });
});
