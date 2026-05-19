import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelFavorites } from './ChannelFavorites.js';

describe('ChannelFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('dédoublonne par channelId', () => {
    const fav = new ChannelFavorites();
    const item = {
      channelId: 'UC1234567890abcdefghij',
      channelName: 'Test Channel',
    };
    expect(fav.toggle(item)).toBe(true);
    expect(fav.getAll()).toHaveLength(1);
    expect(fav.toggle({ ...item, channelName: 'Autre nom' })).toBe(false);
    expect(fav.getAll()).toHaveLength(0);
  });

  it('isFavorite via channelUrl', () => {
    const fav = new ChannelFavorites();
    fav.toggle({
      channelUrl: 'https://www.youtube.com/@foo',
      channelName: 'Foo',
    });
    expect(
      fav.isFavorite({
        channelUrl: 'https://www.youtube.com/@foo',
      })
    ).toBe(true);
  });
});
