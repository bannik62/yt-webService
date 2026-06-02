import { describe, it, expect } from '@jest/globals';
import { shuffleItems } from './probe.js';

describe('shuffleItems', () => {
  it('conserve tous les éléments', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffleItems(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('peut changer l’ordre sur une liste non triviale', () => {
    const input = Array.from({ length: 12 }, (_, i) => i);
    let changed = false;
    for (let t = 0; t < 20; t++) {
      const out = shuffleItems(input);
      if (out.some((v, i) => v !== input[i])) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });
});
