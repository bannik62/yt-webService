import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockYtdl = jest.fn();

jest.unstable_mockModule('youtube-dl-exec', () => ({
  default: (...args) => mockYtdl(...args),
}));

const { fetchVideoMeta, fetchVideoMetaBatch } = await import('./videoMeta.js');

beforeEach(() => {
  mockYtdl.mockReset();
});

describe('fetchVideoMeta', () => {
  it('videoId invalide → 400', async () => {
    await expect(fetchVideoMeta('bad')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockYtdl).not.toHaveBeenCalled();
  });

  it('parse upload_date et view_count', async () => {
    mockYtdl.mockResolvedValue({
      id: 'dQw4w9WgXcQ',
      upload_date: '20091025',
      duration: 212,
      view_count: 1000,
    });

    const meta = await fetchVideoMeta('dQw4w9WgXcQ', { proxyUrl: 'http://proxy' });
    expect(meta.uploadedAt).toBe('2009-10-25');
    expect(meta.duration).toBe(212);
    expect(meta.viewCount).toBe(1000);
    expect(mockYtdl).toHaveBeenCalledWith(
      expect.stringContaining('dQw4w9WgXcQ'),
      expect.objectContaining({ proxy: 'http://proxy', noPlaylist: true })
    );
  });
});

describe('fetchVideoMetaBatch', () => {
  it('ignore ids invalides et déduplique', async () => {
    mockYtdl.mockResolvedValue({
      id: 'aaaaaaaaaaa',
      upload_date: '20240101',
    });

    const { items } = await fetchVideoMetaBatch([
      'aaaaaaaaaaa',
      'aaaaaaaaaaa',
      'short',
    ]);
    expect(items).toHaveLength(1);
    expect(mockYtdl).toHaveBeenCalledTimes(1);
  });
});
