import { createElement } from '../utils/dom.js';

/**
 * Popup de progression pour un téléchargement direct (sans passer par la playlist).
 */
export class DownloadProgressModal {
  constructor() {
    /** @type {HTMLElement | null} */
    this.overlay = null;
    /** @type {HTMLElement | null} */
    this._titleEl = null;
    /** @type {HTMLProgressElement | null} */
    this._progressEl = null;
    /** @type {HTMLElement | null} */
    this._statusEl = null;
    /** @type {((() => void) | null)} */
    this.onUserDismiss = null;
    /** @type {((e: KeyboardEvent) => void) | null} */
    this._escHandler = null;
  }

  /**
   * @param {string} title
   */
  show(title) {
    if (this.overlay) {
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      this.overlay.remove();
      this.overlay = null;
      this._titleEl = null;
      this._progressEl = null;
      this._statusEl = null;
    }

    const overlay = createElement(
      'div',
      {
        className: 'modal-overlay',
        role: 'presentation',
        onClick: () => this.close(true)
      },
      null
    );

    const modalContent = createElement(
      'div',
      {
        className: 'modal-content modal-download-progress',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'download-progress-title',
        onClick: (e) => e.stopPropagation()
      },
      null
    );

    const header = createElement('div', { className: 'modal-header' });

    this._titleEl = createElement(
      'h2',
      {
        id: 'download-progress-title',
        className: 'modal-title'
      },
      title || 'Téléchargement'
    );

    const closeBtn = createElement(
      'button',
      {
        className: 'modal-close',
        type: 'button',
        'aria-label': 'Fermer',
        onClick: () => this.close(true)
      },
      '×'
    );

    header.appendChild(this._titleEl);
    header.appendChild(closeBtn);

    const body = createElement('div', { className: 'modal-body modal-download-progress-body' });

    this._progressEl = /** @type {HTMLProgressElement} */ (
      createElement('progress', {
        className: 'download-modal-progress',
        max: '100',
        value: '0'
      })
    );

    this._statusEl = createElement(
      'p',
      {
        className: 'download-modal-status',
        'aria-live': 'polite',
        'aria-atomic': 'true'
      },
      ''
    );

    body.appendChild(this._progressEl);
    body.appendChild(this._statusEl);

    const footer = createElement('div', {
      className: 'modal-footer modal-download-progress-footer'
    });

    const cancelBtn = createElement(
      'button',
      {
        type: 'button',
        className: 'btn btn-secondary',
        onClick: () => this.close(true)
      },
      'Annuler'
    );

    footer.appendChild(cancelBtn);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    overlay.appendChild(modalContent);

    document.body.appendChild(overlay);
    this.overlay = overlay;

    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close(true);
      }
    };
    document.addEventListener('keydown', this._escHandler);

    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
  }

  /**
   * @param {number} pct
   */
  setProgress(pct) {
    if (!this._progressEl) return;
    const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    this._progressEl.value = p;
  }

  /**
   * @param {string} text
   */
  setQueueStatus(text) {
    if (!this._statusEl) return;
    this._statusEl.textContent = text;
    this._statusEl.hidden = !text;
  }

  clearQueueStatus() {
    this.setQueueStatus('');
  }

  /**
   * @param {boolean} fromUser — true si fermeture demandée par l’utilisateur (backdrop, ×, Échap)
   */
  close(fromUser = false) {
    if (fromUser && this.onUserDismiss) {
      this.onUserDismiss();
    }

    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    if (!this.overlay) {
      this._titleEl = null;
      this._progressEl = null;
      this._statusEl = null;
      return;
    }

    const el = this.overlay;
    this.overlay = null;
    this._titleEl = null;
    this._progressEl = null;
    this._statusEl = null;

    el.classList.add('fade-out');
    setTimeout(() => {
      el.remove();
    }, 200);
  }
}
