import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockYtdlp = jest.fn();
const mockGetCurrentProxy = jest.fn();

jest.unstable_mockModule('youtube-dl-exec', () => ({
  default: (...args) => mockYtdlp(...args),
}));

jest.unstable_mockModule('../proxy/proxyManager.js', () => ({
  getCurrentProxy: () => mockGetCurrentProxy(),
}));

jest.unstable_mockModule('../utils/cookiesHelper.js', () => ({
  getCookiesPath: () => null,
  hasCookies: () => false,
}));

const { getTrending } = await import('./probe.js');

describe('getTrending (mock yt-dlp, pas de réseau)', () => {
  beforeEach(() => {
    mockYtdlp.mockReset();
    mockGetCurrentProxy.mockReturnValue(null);
  });

  it('appelle ytsearchN avec le mot-clé généré', async () => {
    mockYtdlp.mockResolvedValue({
      entries: [
        {
          id: 'dQw4w9WgXcQ',
          title: 'Test',
          uploader: 'Chaîne',
          duration: 100,
        },
      ],
    });

    const { items, keyword } = await getTrending(5, false);

    expect(keyword.length).toBeGreaterThan(0);
    expect(mockYtdlp).toHaveBeenCalledTimes(1);
    const [searchArg, flags] = mockYtdlp.mock.calls[0];
    expect(searchArg).toMatch(/^ytsearch5:/);
    expect(searchArg).toContain(keyword);
    expect(flags.flatPlaylist).toBe(true);
    expect(flags.proxy).toBeUndefined();

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('dQw4w9WgXcQ');
    expect(items[0].url).toContain('dQw4w9WgXcQ');
    expect(items[0].thumbnail).toContain('dQw4w9WgXcQ');
  });

  it('opts.proxyUrl force le proxy sur le 1er essai', async () => {
    mockYtdlp.mockResolvedValue({ entries: [{ id: 'abc123def45', title: 'X' }] });

    await getTrending(3, false, { proxyUrl: 'http://user:pass@proxy:8080' });

    expect(mockYtdlp.mock.calls[0][1].proxy).toBe(
      'http://user:pass@proxy:8080'
    );
  });

  it('402 proxy → second essai sans proxy', async () => {
    mockGetCurrentProxy.mockReturnValue('http://proxy:8080');
    mockYtdlp
      .mockRejectedValueOnce(new Error('402 Payment Required'))
      .mockResolvedValueOnce({
        entries: [{ id: 'abc123def45', title: 'Après fallback' }],
      });

    const { items } = await getTrending(5, false);

    expect(mockYtdlp).toHaveBeenCalledTimes(2);
    expect(mockYtdlp.mock.calls[0][1].proxy).toBe('http://proxy:8080');
    expect(mockYtdlp.mock.calls[1][1].proxy).toBeUndefined();
    expect(items[0].title).toBe('Après fallback');
  });

  it('entries vides → items []', async () => {
    mockYtdlp.mockResolvedValue({ entries: [] });
    const { items } = await getTrending(10, true);
    expect(items).toEqual([]);
  });

  it('réponse sans entries → items []', async () => {
    mockYtdlp.mockResolvedValue(null);
    const { items } = await getTrending(10, false);
    expect(items).toEqual([]);
  });

  it('mode general exclut les vidéos ≤ 60 s (Shorts)', async () => {
    mockYtdlp.mockResolvedValue({
      entries: [
        { id: 'long1111111', title: 'Longue', duration: 120 },
        { id: 'short222222', title: 'Short', duration: 45 },
        { id: 'unk33333333', title: 'Inconnue', duration: 0 },
      ],
    });

    const { items } = await getTrending(10, false);

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['long1111111', 'unk33333333']);
    expect(items.find((i) => i.id === 'short222222')).toBeUndefined();
  });

  it('mode shortsOnly n’inclut que les vidéos ≤ 60 s ou durée inconnue', async () => {
    mockYtdlp.mockResolvedValue({
      entries: [
        { id: 'long1111111', title: 'Longue', duration: 120 },
        { id: 'short222222', title: 'Short', duration: 45 },
        { id: 'unk33333333', title: 'Inconnue', duration: 0 },
      ],
    });

    const { items } = await getTrending(10, false, { shortsOnly: true });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['short222222', 'unk33333333']);
    expect(items.every((i) => i.isShort)).toBe(true);
  });
});
