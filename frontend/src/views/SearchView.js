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
    items.forEach(item => {
      const li = createElement('li', { className: 'result' });
      
      // Miniature si disponible
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
      
      const title = createElement('div', {
        className: 'result-title'
      }, escapeHtml(item.title));
      
      const meta = createElement('div', {
        className: 'result-meta'
      }, `${escapeHtml(item.channel ?? '—')} · ${formatDuration(item.duration)}`);
      
      content.appendChild(title);
      content.appendChild(meta);
      li.appendChild(content);
      
      // Bouton + discret pour ajouter directement à la playlist
      const addBtn = createElement('button', { 
        className: 'quick-add-btn',
        innerHTML: '+'
      });
      
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Empêche d'ouvrir la modale
        this.onQuickAdd?.(item);
      });
      
      li.appendChild(addBtn);
      
      // Clic → ouvre modal vidéo
      li.addEventListener('click', () => {
        this.onResultClick?.(item);
      });
      
      this.results.appendChild(li);
    });
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
