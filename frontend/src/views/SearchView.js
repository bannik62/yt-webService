import { $, createElement } from '../utils/dom.js';
import { formatDuration, escapeHtml } from '../utils/formatters.js';

/**
 * Gère l'interface de recherche
 */
export class SearchView {
  constructor(apiClient) {
    this.api = apiClient;
    this.form = $('#search-form');
    this.input = $('#search-input');
    this.hint = $('#search-hint');
    this.results = $('#search-results');
    
    this.init();
  }

  init() {
    if (!this.form) return;
    
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });
  }

  async handleSearch() {
    const query = this.input?.value.trim() ?? '';
    if (!query) return;

    this.onBeforeSearch?.();
    this.results.innerHTML = '';
    this.setHint('Recherche…', false);

    try {
      const data = await this.api.search(query);
      this.setHint('', false);
      
      const items = data.items ?? [];
      if (items.length === 0) {
        this.setHint('Aucun résultat.', false);
        return;
      }

      this.renderResults(items);
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        this.setHint('Délai dépassé — vérifie que le backend tourne.', true);
      } else {
        this.setHint(err.message || 'Réseau ou serveur indisponible.', true);
      }
    }
  }

  renderResults(items) {
    if (!this.results) return;
    this.results.innerHTML = '';
    this.appendResults(items);
  }

  /**
   * Ajoute des cartes résultat sans vider la liste (ex. scroll infini tendances).
   */
  appendResults(items) {
    if (!this.results) return;

    items.forEach((item) => {
      const li = createElement('li', { className: 'result' });

      if (item.thumbnail) {
        const img = createElement('img', {
          src: item.thumbnail,
          alt: escapeHtml(item.title),
          className: 'result-thumb',
          loading: 'lazy'
        });
        li.appendChild(img);
      }

      const content = createElement('div', { className: 'result-content' });

      const title = createElement(
        'div',
        { className: 'result-title' },
        escapeHtml(item.title)
      );

      const meta = createElement(
        'div',
        { className: 'result-meta' },
        `${escapeHtml(item.channel ?? '—')} · ${formatDuration(item.duration)}`
      );

      content.appendChild(title);
      content.appendChild(meta);
      li.appendChild(content);

      const actions = createElement('div', { className: 'result-card-actions' });

      const downloadBtn = createElement('button', {
        type: 'button',
        className: 'quick-download-btn',
        title:
          'Ajouter à la liste si besoin, puis télécharger uniquement cette vidéo en MP4',
        'aria-label': 'Télécharger cette vidéo en MP4'
      });
      downloadBtn.innerHTML = '↓';
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onQuickDownload?.(item);
      });

      const addBtn = createElement('button', {
        type: 'button',
        className: 'quick-add-btn',
        title: 'Ajouter à la liste',
        'aria-label': 'Ajouter à la liste',
        innerHTML: '+'
      });
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onQuickAdd?.(item);
      });

      actions.appendChild(downloadBtn);
      actions.appendChild(addBtn);
      li.appendChild(actions);

      li.addEventListener('click', () => {
        this.onResultClick?.(item);
      });

      this.results.appendChild(li);
    });
  }

  /**
   * Indicateur discret en bas de liste pendant le chargement tendances.
   */
  setTrendingLoadingMore(loading) {
    if (!this.results) return;
    const existing = this.results.querySelector('.results-load-more');
    if (loading) {
      if (existing) return;
      const li = createElement('li', { className: 'results-load-more' }, 'Chargement…');
      this.results.appendChild(li);
    } else if (existing) {
      existing.remove();
    }
  }

  setHint(text, isError = false) {
    if (!this.hint) return;
    
    if (!text) {
      this.hint.hidden = true;
      this.hint.textContent = '';
      return;
    }
    
    this.hint.hidden = false;
    this.hint.textContent = text;
    this.hint.classList.toggle('error', Boolean(isError));
  }

  show() {
    const container = this.form?.parentElement;
    if (container) container.hidden = false;
  }

  hide() {
    const container = this.form?.parentElement;
    if (container) container.hidden = true;
  }
}
