import { describe, it, expect, beforeEach } from 'vitest';
import { Favorites } from './Favorites.js';

describe('Favorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remove retire une entrée par videoId', () => {
    const fav = new Favorites();
    fav.toggle({ videoId: 'dQw4w9WgXcQ', title: 'Test' });
    expect(fav.getAll()).toHaveLength(1);
    expect(fav.remove('dQw4w9WgXcQ')).toBe(true);
    expect(fav.getAll()).toHaveLength(0);
  });
});
