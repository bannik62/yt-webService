import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockYtdlp = jest.fn();

jest.unstable_mockModule('youtube-dl-exec', () => ({
  default: (...args) => mockYtdlp(...args),
}));

jest.unstable_mockModule('../utils/cookiesHelper.js', () => ({
  getCookiesPath: () => null,
}));

jest.unstable_mockModule('../proxy/proxyManager.js', () => ({
  getCurrentProxy: () => null,
}));

const { fetchVideoMeta, videoMetaFromProbeApi, clearVideoMetaCacheForTests } =
  await import('./videoMeta.js');
const { ProxyQuotaError } = await import('../ripper/proxyQuotaError.js');

describe('fetchVideoMeta', () => {
  beforeEach(() => {
    mockYtdlp.mockReset();
    clearVideoMetaCacheForTests();
  });

  it('videoId invalide → 400', async () => {
    await expect(fetchVideoMeta('bad')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockYtdlp).not.toHaveBeenCalled();
  });

  it('parse upload_date, vues, chaîne, description', async () => {
    mockYtdlp.mockResolvedValue({
      id: 'dQw4w9WgXcQ',
      upload_date: '20240315',
      duration: 212,
      view_count: 1_500_000,
      uploader: 'Rick Astley',
      description: 'Never gonna give you up. '.repeat(30),
    });

    const meta = await fetchVideoMeta('dQw4w9WgXcQ');

    expect(meta.available).toBe(true);
    expect(meta.uploadedAt).toBe('2024-03-15');
    expect(meta.duration).toBe(212);
    expect(meta.viewCount).toBe(1_500_000);
    expect(meta.channel).toBe('Rick Astley');
    expect(meta.descriptionPreview).toBeTruthy();
    expect(mockYtdlp.mock.calls[0][1].proxy).toBeUndefined();
  });

  it('utilise le proxy quand fourni', async () => {
    mockYtdlp.mockResolvedValue({
      id: '9PZ1NYC61O0',
      duration: 60,
      uploader: 'Ch',
    });

    await fetchVideoMeta('9PZ1NYC61O0', {
      proxyUrl: 'http://user:pass@proxy.example:8080',
    });

    expect(mockYtdlp).toHaveBeenCalledTimes(1);
    const flags = mockYtdlp.mock.calls[0][1];
    expect(flags.proxy).toBe('http://user:pass@proxy.example:8080');
  });

  it('402 proxy → ProxyQuotaError (relais worker)', async () => {
    mockYtdlp.mockRejectedValue(
      new Error('402 Payment Required (Tunnel connection failed)')
    );

    await expect(
      fetchVideoMeta('m_DrYwvYxbg', {
        proxyUrl: 'http://user:pass@proxy.example:8080',
      })
    ).rejects.toBeInstanceOf(ProxyQuotaError);
  });

  it('échec yt-dlp sans proxy → champs null, available false', async () => {
    mockYtdlp.mockRejectedValue(new Error('blocked'));

    const meta = await fetchVideoMeta('abc123def45');

    expect(meta.available).toBe(false);
    expect(meta.uploadedAt).toBeNull();
    expect(meta.viewCount).toBeNull();
  });

  it('réponse vide → available false', async () => {
    mockYtdlp.mockResolvedValue(null);

    const meta = await fetchVideoMeta('jNQXAC9IVRw');

    expect(meta.available).toBe(false);
    expect(meta.id).toBe('jNQXAC9IVRw');
  });
});

describe('videoMetaFromProbeApi', () => {
  it('mappe la réponse probe relais worker', () => {
    const meta = videoMetaFromProbeApi(
      {
        videoId: 'dQw4w9WgXcQ',
        uploadedAt: '2024-03-15',
        durationSeconds: 212,
        viewCount: 1000,
        channel: 'Artist',
        descriptionPreview: 'Hello',
      },
      'dQw4w9WgXcQ'
    );

    expect(meta.available).toBe(true);
    expect(meta.uploadedAt).toBe('2024-03-15');
    expect(meta.duration).toBe(212);
    expect(meta.viewCount).toBe(1000);
    expect(meta.descriptionPreview).toBe('Hello');
  });
});
