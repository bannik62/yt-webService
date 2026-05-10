import { $, createElement } from '../utils/dom.js';
import { formatDuration, escapeHtml } from '../utils/formatters.js';

/**
 * Gère l'affichage de la liste de téléchargement (sidebar)
 */
export class DownloadListView {
  constructor(downloadList) {
    this.list = downloadList;
    this.container = $('#download-list');
    this.itemsContainer = $('#download-list-items');
    this.countBadge = $('#download-list-count');
    this.downloadBtn = $('#download-list-btn');
    this.clearBtn = $('#download-list-clear');
    
    this.onDownload = null;
    
    this.init();
    this.render();
  }

  init() {
    if (!this.container) return;
    
    this.downloadBtn?.addEventListener('click', () => {
      if (!this.list.isEmpty && this.onDownload) {
        this.onDownload(this.list.getUrls());
      }
    });
    
    this.clearBtn?.addEventListener('click', () => {
      if (confirm('Vider la liste de téléchargement ?')) {
        this.list.clear();
      }
    });
    
    this.list.onChange(() => this.render());
  }

  /**
   * Ajoute un item et rafraîchit l'affichage
   * @param {object} item
   */
  addItem(item) {
    const success = this.list.add(item);
    if (success) {
      this.showNotification(`✓ Ajouté : ${item.title}`);
    } else {
      if (this.list.getAll().some(i => i.url === item.url)) {
        this.showNotification('⚠ Déjà dans la liste', true);
      } else {
        this.showNotification('⚠ Liste pleine (max 50)', true);
      }
    }
    return success;
  }

  /**
   * Rafraîchit l'affichage complet
   */
  render() {
    if (!this.itemsContainer) return;
    
    const items = this.list.getAll();
    
    // Badge count
    if (this.countBadge) {
      this.countBadge.textContent = items.length;
      this.countBadge.hidden = items.length === 0;
    }
    
    // Boutons
    if (this.downloadBtn) {
      this.downloadBtn.disabled = items.length === 0;
      const text = items.length > 0 
        ? `🎵 Télécharger (${items.length})`
        : 'Liste vide';
      this.downloadBtn.textContent = text;
    }
    if (this.clearBtn) {
      this.clearBtn.hidden = items.length === 0;
    }
    
    // Liste vide
    if (items.length === 0) {
      this.itemsContainer.innerHTML = '<p class="list-empty">Recherche et ajoute des morceaux à télécharger</p>';
      return;
    }
    
    // Render items
    this.itemsContainer.innerHTML = '';
    items.forEach((item, index) => {
      const li = createElement('li', { className: 'list-item' });
      
      const num = createElement('div', { className: 'list-item-num' }, String(index + 1));
      li.appendChild(num);
      
      const content = createElement('div', { className: 'list-item-content' });
      
      const title = createElement('div', {
        className: 'list-item-title',
        title: item.title
      }, escapeHtml(item.title));
      
      const meta = createElement('div', {
        className: 'list-item-meta'
      }, `${escapeHtml(item.channel || '—')} · ${formatDuration(item.duration)}`);
      
      content.appendChild(title);
      content.appendChild(meta);
      
      const removeBtn = createElement('button', {
        type: 'button',
        className: 'list-item-remove',
        title: 'Retirer',
        onClick: (e) => {
          e.stopPropagation();
          this.list.remove(item.id);
        }
      }, '×');
      
      li.appendChild(content);
      li.appendChild(removeBtn);
      this.itemsContainer.appendChild(li);
    });
  }

  /**
   * Affiche une notification temporaire
   * @param {string} message
   * @param {boolean} isError
   */
  showNotification(message, isError = false) {
    const notif = createElement('div', {
      className: `list-notification ${isError ? 'error' : 'success'}`
    }, message);
    
    this.container?.appendChild(notif);
    
    setTimeout(() => {
      notif.classList.add('fade-out');
      setTimeout(() => notif.remove(), 300);
    }, 2500);
  }

  /**
   * Active/désactive les boutons pendant téléchargement
   * @param {boolean} disabled
   */
  setLoading(disabled) {
    if (this.downloadBtn) {
      this.downloadBtn.disabled = disabled;
      if (disabled) {
        this.downloadBtn.textContent = '⏳ Téléchargement...';
      }
    }
    if (this.clearBtn) this.clearBtn.disabled = disabled;
  }
}
