import { describe, it, expect } from 'vitest';
import { isShortEntry, entryToPlayItem } from './shortPlayback.js';

describe('shortPlayback', () => {
  it('isShortEntry via flag', () => {
    expect(isShortEntry({ isShort: true, duration: 300 })).toBe(true);
  });

  it('isShortEntry via duration ≤ 60', () => {
    expect(isShortEntry({ duration: 45 })).toBe(true);
    expect(isShortEntry({ duration: 61 })).toBe(false);
    expect(isShortEntry({ duration: 0 })).toBe(false);
  });

  it('entryToPlayItem normalise id et isShort', () => {
    const item = entryToPlayItem({
      videoId: 'dQw4w9WgXcQ',
      title: 'T',
      isShort: true,
    });
    expect(item?.id).toBe('dQw4w9WgXcQ');
    expect(item?.isShort).toBe(true);
  });
});
