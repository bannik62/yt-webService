import { createElement } from '../utils/dom.js';

/**
 * Modal Tendances : case musique + lancement (mot-clé aléatoire c serveur)
 */
export class TrendingModal {
  constructor() {
    this.modal = null;
    /** @type {((musicOnly: boolean) => void) | null} */
    this.onConfirm = null;
    this.musicOnly = false;
  }

  show() {
    this.render();
  }

  close() {
    if (this.modal) {
      this.modal.classList.add('fade-out');
      setTimeout(() => {
        this.modal.remove();
        this.modal = null;
      }, 200);
    }
  }

  confirm() {
    if (this.onConfirm) {
      this.onConfirm(this.musicOnly);
    }
    this.close();
  }

  render() {
    if (this.modal) {
      this.modal.remove();
    }

    const overlay = createElement('div', {
      className: 'modal-overlay',
      onClick: () => this.close()
    });

    const modalContent = createElement('div', {
      className: 'modal-content modal-trending',
      onClick: (e) => e.stopPropagation()
    });

    const header = createElement('div', { className: 'modal-header' });

    const title = createElement('h2', {
      className: 'modal-title'
    }, '🔥 Tendances');

    const closeBtn = createElement('button', {
      className: 'modal-close',
      type: 'button',
      onClick: () => this.close()
    }, '×');

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = createElement('div', { className: 'modal-body' });

    const filterContainer = createElement('div', { className: 'trending-filter' });

    const checkbox = createElement('input', {
      type: 'checkbox',
      id: 'music-only-checkbox',
      checked: this.musicOnly
    });

    checkbox.addEventListener('change', (e) => {
      this.musicOnly = e.target.checked;
    });

    const label = createElement('label', {
      for: 'music-only-checkbox',
      className: 'trending-filter-label'
    });

    const labelText = createElement('span', {}, '🎵 Musique uniquement');

    label.appendChild(checkbox);
    label.appendChild(labelText);
    filterContainer.appendChild(label);

    const note = createElement('p', {
      className: 'trending-note muted'
    }, 'À chaque clic, un thème est choisi au hasard dans une liste (recherche YouTube).');

    body.appendChild(filterContainer);
    body.appendChild(note);

    const footer = createElement('div', { className: 'modal-footer modal-trending-footer' });
    footer.appendChild(
      createElement('button', {
        className: 'btn btn-primary',
        type: 'button',
        onClick: () => this.confirm()
      }, 'Voir les vidéos')
    );

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    overlay.appendChild(modalContent);

    document.body.appendChild(overlay);
    this.modal = overlay;

    setTimeout(() => overlay.classList.add('show'), 10);

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
}
