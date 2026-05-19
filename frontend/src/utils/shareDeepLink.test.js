import { describe, expect, it } from 'vitest';
import { getShareVideoIdFromLocation } from './shareDeepLink.js';

describe('shareDeepLink', () => {
  it('lit v depuis query ou hash', () => {
    window.history.replaceState(null, '', '/?v=dQw4w9WgXcQ');
    expect(getShareVideoIdFromLocation()).toBe('dQw4w9WgXcQ');

    window.history.replaceState(null, '', '/#v=dQw4w9WgXcQ');
    expect(getShareVideoIdFromLocation()).toBe('dQw4w9WgXcQ');

    window.history.replaceState(null, '', '/');
    expect(getShareVideoIdFromLocation()).toBe(null);
  });
});
