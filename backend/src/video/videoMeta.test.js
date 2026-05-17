import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockYtdlp = jest.fn();

jest.unstable_mockModule('youtube-dl-exec', () => ({
  default: (...args) => mockYtdlp(...args),
}));

jest.unstable_mockModule('../utils/cookiesHelper.js', () => ({
  getCookiesPath: () => null,
}));

const { fetchVideoMeta } = await import('./videoMeta.js');

describe('fetchVideoMeta', () => {
  beforeEach(() => {
    mockYtdlp.mockReset();
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

  it('échec yt-dlp → champs null, available false (pas d’exception)', async () => {
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
