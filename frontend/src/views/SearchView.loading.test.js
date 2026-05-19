import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchView } from './SearchView.js';

describe('SearchView loading', () => {
  /** @type {SearchView} */
  let view;
  /** @type {boolean | null} */
  let loadingState = null;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="search-loading" hidden>
        <span id="search-loading-label"></span>
      </div>
      <ul id="search-results"></ul>
    `;
    view = new SearchView({ search: async () => ({ items: [] }) });
    loadingState = null;
    view.onLoadingChange = (loading) => {
      loadingState = loading;
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('setLoading affiche le loader et notifie', () => {
    view.setLoading(true, 'Test…');
    expect(document.getElementById('search-loading')?.hidden).toBe(false);
    expect(document.getElementById('search-loading-label')?.textContent).toBe(
      'Test…'
    );
    expect(loadingState).toBe(true);

    view.setLoading(false);
    expect(document.getElementById('search-loading')?.hidden).toBe(true);
    expect(loadingState).toBe(false);
  });
});
