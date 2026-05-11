import { createElement } from '../utils/dom.js';
import { escapeHtml } from '../utils/formatters.js';

/**
 * Extrait l'ID vidéo YouTube depuis une URL
 * @param {string} url
 * @returns {string|null}
 */
function extractYoutubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Modal pour afficher vidéo YouTube et ajouter à la liste
 */
export class VideoModal {
  constructor() {
    this.modal = null;
    this.currentItem = null;
    this.playlist = null;
    this.currentIndex = 0;
    this.onAdd = null;
    this.onNext = null;
    this.onPrevious = null;
  }

  /**
   * Affiche le modal avec une vidéo
   * @param {object} item
   * @param {Array} playlist - Liste complète (optionnel)
   * @param {number} index - Index dans la playlist (optionnel)
   */
  show(item, playlist = null, index = 0) {
    this.currentItem = item;
    this.playlist = playlist;
    this.currentIndex = index;
    this.render();
  }

  /**
   * Ferme le modal
   */
  close() {
    if (this.modal) {
      this.modal.classList.add('fade-out');
      setTimeout(() => {
        this.modal.remove();
        this.modal = null;
        this.currentItem = null;
        this.playlist = null;
        this.currentIndex = 0;
      }, 200);
    }
  }

  /**
   * Crée et affiche le modal
   */
  render() {
    // Fermer modal existant
    if (this.modal) {
      this.modal.remove();
    }

    const videoId = extractYoutubeId(this.currentItem.url);
    if (!videoId) {
      alert('URL YouTube invalide');
      return;
    }

    // Overlay
    const overlay = createElement('div', {
      className: 'modal-overlay',
      onClick: () => this.close()
    });

    // Modal content
    const modalContent = createElement('div', {
      className: 'modal-content',
      onClick: (e) => e.stopPropagation()
    });

    // Header
    const header = createElement('div', { className: 'modal-header' });
    
    const title = createElement('h2', {
      className: 'modal-title'
    }, escapeHtml(this.currentItem.title));
    
    const closeBtn = createElement('button', {
      className: 'modal-close',
      type: 'button',
      onClick: () => this.close()
    }, '×');
    
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body avec iframe
    const body = createElement('div', { className: 'modal-body' });
    
    const iframeContainer = createElement('div', { className: 'video-container' });
    const iframe = createElement('iframe', {
      src: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
      frameborder: '0',
      allow: 'autoplay; encrypted-media; fullscreen',
      allowfullscreen: true
    });
    iframeContainer.appendChild(iframe);
    body.appendChild(iframeContainer);

    // Footer avec bouton(s)
    const footer = createElement('div', { className: 'modal-footer' });
    
    // Navigation playlist (si applicable)
    if (this.playlist && this.playlist.length > 1) {
      const nav = createElement('div', { className: 'modal-nav' });
      
      const prevBtn = createElement('button', {
        className: 'btn btn-secondary',
        type: 'button',
        disabled: this.currentIndex === 0,
        onClick: () => this.showPrevious()
      }, '← Précédent');
      
      const counter = createElement('span', {
        className: 'modal-counter'
      }, `${this.currentIndex + 1} / ${this.playlist.length}`);
      
      const nextBtn = createElement('button', {
        className: 'btn btn-secondary',
        type: 'button',
        disabled: this.currentIndex === this.playlist.length - 1,
        onClick: () => this.showNext()
      }, 'Suivant →');
      
      nav.appendChild(prevBtn);
      nav.appendChild(counter);
      nav.appendChild(nextBtn);
      footer.appendChild(nav);
    }
    
    const addBtn = createElement('button', {
      className: 'btn btn-primary btn-large',
      type: 'button',
      onClick: () => {
        if (this.onAdd) {
          this.onAdd(this.currentItem);
        }
        // Ne pas fermer si on est en mode playlist
        if (!this.playlist) {
          this.close();
        }
      }
    }, '➕ Ajouter à ma liste');
    
    footer.appendChild(addBtn);

    // Assemblage
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    overlay.appendChild(modalContent);

    // Ajout au DOM
    document.body.appendChild(overlay);
    this.modal = overlay;

    // Animation d'entrée
    setTimeout(() => overlay.classList.add('show'), 10);

    // ESC pour fermer
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  /**
   * Passe à la vidéo suivante dans la playlist
   */
  showNext() {
    if (!this.playlist || this.currentIndex >= this.playlist.length - 1) return;
    this.currentIndex++;
    this.currentItem = this.playlist[this.currentIndex];
    this.render();
    if (this.onNext) this.onNext(this.currentIndex);
  }

  /**
   * Passe à la vidéo précédente dans la playlist
   */
  showPrevious() {
    if (!this.playlist || this.currentIndex <= 0) return;
    this.currentIndex--;
    this.currentItem = this.playlist[this.currentIndex];
    this.render();
    if (this.onPrevious) this.onPrevious(this.currentIndex);
  }
}
