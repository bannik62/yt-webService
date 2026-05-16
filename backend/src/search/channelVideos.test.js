import { describe, it, expect } from '@jest/globals';
import {
  resolveChannelVideosUrl,
  channelNamesMatch,
} from './channelVideos.js';

describe('resolveChannelVideosUrl', () => {
  it('construit /channel/UC…/videos', () => {
    expect(
      resolveChannelVideosUrl({ channelId: 'UC1234567890abcdefghij' })
    ).toBe('https://www.youtube.com/channel/UC1234567890abcdefghij/videos');
  });

  it('ajoute /videos sur @handle', () => {
    expect(
      resolveChannelVideosUrl({
        channelUrl: 'https://www.youtube.com/@Gotaga',
      })
    ).toBe('https://www.youtube.com/@Gotaga/videos');
  });
});

describe('channelNamesMatch', () => {
  it('compare sans casse', () => {
    expect(channelNamesMatch('Gotaga', 'gotaga')).toBe(true);
    expect(channelNamesMatch('Gotaga', 'Michou')).toBe(false);
  });
});
