import { describe, it, expect } from '@jest/globals';
import {
  stripAffiliateUrlsFromDescription,
  sanitizeDescriptionForDisplay,
} from './descriptionSanitize.js';

describe('stripAffiliateUrlsFromDescription', () => {
  it('retire amzn.to et aliexpress, garde le texte produit', () => {
    const raw = `Intro
: https://amzn.to/3FNbSOs -Système de lévitation ( modèle à 71 euros ) : https://fr.aliexpress.com/item/1005003237752676.html?spm=a
Fin`;

    const out = stripAffiliateUrlsFromDescription(raw);

    expect(out).not.toMatch(/amzn\.to/i);
    expect(out).not.toMatch(/aliexpress/i);
    expect(out).toContain('lévitation');
    expect(out).toContain('71 euros');
  });

  it('conserve une URL non boutique', () => {
    const raw = 'Doc : https://example.org/guide.pdf et fin';
    const out = stripAffiliateUrlsFromDescription(raw);
    expect(out).toContain('https://example.org/guide.pdf');
  });
});

describe('sanitizeDescriptionForDisplay', () => {
  it('retourne null si tout était des liens affiliation', () => {
    expect(
      sanitizeDescriptionForDisplay(
        'https://amzn.to/abc https://fr.aliexpress.com/item/123.html'
      )
    ).toBeNull();
  });
});
