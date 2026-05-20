import { describe, it, expect } from 'vitest';
import { averageEdgeColor } from './thumbnailAmbientLight.js';

describe('averageEdgeColor', () => {
  it('moyenne le bord haut', () => {
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let x = 0; x < w; x++) {
      const i = x * 4;
      data[i] = 200;
      data[i + 1] = 10;
      data[i + 2] = 10;
      data[i + 3] = 255;
    }
    expect(averageEdgeColor(data, w, h, 'top', 1)).toBe('rgba(200, 10, 10, 0.92)');
  });
});
