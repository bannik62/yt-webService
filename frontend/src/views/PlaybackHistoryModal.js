import { createElement } from '../utils/dom.js';
import { escapeHtml, formatDuration, formatPlayedAt } from '../utils/formatters.js';

/**
 * Popup : historique des vidéos lues (date / heure de dernière lecture).
 */
export class PlaybackHistoryModal {
  /**
   * @param {import('../models/PlaybackHistory.js').PlaybackHistory} history
   */
  constructor(history) {
    this.history = history;
    /** @type {((item: object) => void) | null} */
    this.onPlayItem = null;
    this.overlay = null;
    /** @type {HTMLElement | null} */
    this.listEl = null;

    history.onChange(() => {
      if (this.overlay) this.#renderList();
    });
  }

  open() {
    if (this.overlay) {
      this.overlay.classList.remove('fade-out');
      this.overlay.classList.add('show');
      this.#renderList();
      return;
    }
    this.#build();
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.add('fade-out');
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
      this.listEl = null;
    }, 200);
  }

  #build() {
    const overlay = createElement('div', {
      className: 'modal-overlay history-modal-overlay',
      onClick: () => this.close(),
    });

    const content = createElement('div', {
      className: 'modal-content history-modal-content',
      onClick: (e) => e.stopPropagation(),
    });

    const header = createElement('div', { className: 'modal-header' });
    header.appendChild(
      createElement('h2', { className: 'modal-title' }, 'Historique')
    );
    header.appendChild(
      createElement('button', {
        className: 'modal-close',
        type: 'button',
        onClick: () => this.close(),
      }, '×')
    );

    const body = createElement('div', { className: 'modal-body history-modal-body' });
    this.listEl = createElement('ul', {
      className: 'history-list',
      id: 'playback-history-list',
    });
    body.appendChild(this.listEl);

    const footer = createElement('div', {
      className: 'modal-footer history-modal-footer',
    });
    footer.appendChild(
      createElement('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        onClick: () => {
          if (this.history.getAll().length === 0) return;
          if (confirm('Effacer tout l’historique de lecture ?')) {
            this.history.clear();
          }
        },
      }, 'Effacer l’historique')
    );

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    this.overlay = overlay;

    setTimeout(() => overlay.classList.add('show'), 10);

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    this.#renderList();
  }

  #renderList() {
    if (!this.listEl) return;
    const entries = this.history.getAll();
    this.listEl.innerHTML = '';

    if (entries.length === 0) {
      this.listEl.appendChild(
        createElement(
          'li',
          { className: 'history-list-empty' },
          'Aucune lecture enregistrée. Ouvre une vidéo depuis la recherche ou « Lire » sur ta liste.'
        )
      );
      return;
    }

    for (const entry of entries) {
      const li = createElement('li', { className: 'history-list-item' });
      li.tabIndex = 0;
      li.setAttribute('role', 'button');

      if (entry.thumbnail) {
        li.appendChild(
          createElement('img', {
            className: 'history-list-thumb',
            src: entry.thumbnail,
            alt: '',
            loading: 'lazy',
          })
        );
      }

      const main = createElement('div', { className: 'history-list-main' });
      main.appendChild(
        createElement(
          'div',
          { className: 'history-list-title', title: entry.title },
          escapeHtml(entry.title)
        )
      );
      main.appendChild(
        createElement(
          'div',
          { className: 'history-list-meta' },
          `${escapeHtml(entry.channel || '—')} · ${formatDuration(entry.duration)}`
        )
      );
      main.appendChild(
        createElement(
          'div',
          { className: 'history-list-played' },
          formatPlayedAt(entry.playedAt)
        )
      );
      li.appendChild(main);

      const play = () => {
        this.onPlayItem?.({
          id: entry.videoId,
          url: entry.url,
          title: entry.title,
          channel: entry.channel,
          duration: entry.duration,
          thumbnail: entry.thumbnail,
        });
        this.close();
      };
      li.addEventListener('click', play);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          play();
        }
      });

      this.listEl.appendChild(li);
    }
  }
}
