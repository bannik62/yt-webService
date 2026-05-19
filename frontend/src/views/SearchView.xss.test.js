import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SearchView } from './SearchView.js';
import { XSS_PAYLOADS } from '../test/xssPayloads.js';

describe('SearchView.appendResults (XSS)', () => {
  /** @type {HTMLElement} */
  let resultsEl;

  beforeEach(() => {
    document.body.innerHTML = '<ul id="search-results"></ul>';
    resultsEl = document.getElementById('search-results');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each(XSS_PAYLOADS)('titre malveillant sans exécution : %s', (title) => {
    const view = new SearchView(null);
    view.appendResults([
      {
        id: 'dQw4w9WgXcQ',
        title,
        channel: 'Chaîne <script>alert(1)</script>',
        duration: 120,
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    ]);

    expect(resultsEl.querySelectorAll('script').length).toBe(0);
    const titleEl = resultsEl.querySelector('.result-title');
    expect(titleEl).toBeTruthy();
    expect(titleEl.querySelector('script')).toBeNull();
    expect(titleEl.innerHTML).not.toMatch(/<script/i);

    const badge = resultsEl.querySelector('.result-channel-badge');
    if (badge) {
      expect(badge.querySelector('script')).toBeNull();
      expect(badge.innerHTML).not.toMatch(/<script/i);
    }

    const img = resultsEl.querySelector('img.result-thumb');
    expect(img?.getAttribute('alt')).not.toMatch(/<script/i);
  });
});
