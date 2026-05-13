import { $ } from './utils/dom.js';
import { ApiClient } from './api/ApiClient.js';
import { SearchMode } from './modes/SearchMode.js';
import { RipperMode } from './modes/RipperMode.js';
import { ProxyModal } from './views/ProxyModal.js';

/**
 * @param {HTMLElement | null} el
 * @returns {Promise<void>}
 */
function waitViewExitTransition(el) {
  return new Promise((resolve) => {
    if (!el || el.hidden) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(tid);
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    const tid = setTimeout(finish, 340);
    const onEnd = (e) => {
      if (e.target !== el) return;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    el.classList.add('is-mode-out');
  });
}

/**
 * @param {HTMLElement | null} el
 * @returns {Promise<void>}
 */
async function playViewEnterTransition(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.remove('is-mode-out');
  el.classList.add('is-mode-in-start');
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r))
  );
  el.classList.remove('is-mode-in-start');
}

/**
 * Application principale
 */
class App {
  constructor() {
    this.api = new ApiClient();
    this.proxyModal = new ProxyModal();

    // Deux modes complètement séparés
    this.searchMode = new SearchMode(this.api);
    this.ripperMode = new RipperMode(this.api);

    this.currentMode = 'search';
    this._modeSwitchBusy = false;

    this.init();
  }

  init() {
    // Bouton proxy modal
    const proxyBtn = $('#refresh-proxy-btn');
    if (proxyBtn) {
      proxyBtn.addEventListener('click', () => this.showProxyModal());
      this.updateProxyButton(); // Mettre à jour au démarrage
    }

    // Toggle entre modes
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.switchMode(e.target.value);
        }
      });

      // Initialiser le mode selon le radio coché par défaut
      if (radio.checked) {
        this.currentMode = radio.value;
      }
    });

    // Afficher le mode initial (sans animation au premier rendu)
    this.switchMode(this.currentMode, { instant: true });
  }

  /**
   * @param {'search' | 'ripper'} mode
   * @param {{ instant?: boolean }} [opts]
   */
  switchMode(mode, opts = {}) {
    const searchEl = $('#search-container');
    const ripperEl = $('#ripper-container');

    let instant = opts.instant === true;
    if (
      !instant &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      instant = true;
    }

    if (mode === this.currentMode && !instant) {
      return;
    }

    if (instant) {
      if (mode === 'search') {
        this.ripperMode.hide();
        if (ripperEl) {
          ripperEl.hidden = true;
          ripperEl.classList.remove('is-mode-out', 'is-mode-in-start');
        }
        if (searchEl) {
          searchEl.hidden = false;
          searchEl.classList.remove('is-mode-out', 'is-mode-in-start');
        }
        this.searchMode.show();
      } else {
        this.searchMode.hide();
        if (searchEl) {
          searchEl.hidden = true;
          searchEl.classList.remove('is-mode-out', 'is-mode-in-start');
        }
        if (ripperEl) {
          ripperEl.hidden = false;
          ripperEl.classList.remove('is-mode-out', 'is-mode-in-start');
        }
        this.ripperMode.show();
      }
      this.currentMode = mode;
      return;
    }

    if (this._modeSwitchBusy) {
      return;
    }
    this._modeSwitchBusy = true;
    void this._switchModeAnimated(mode).finally(() => {
      this._modeSwitchBusy = false;
    });
  }

  /**
   * Transition type « Svelte » (fade + léger slide) entre les deux vues.
   * @param {'search' | 'ripper'} mode
   */
  async _switchModeAnimated(mode) {
    const searchEl = $('#search-container');
    const ripperEl = $('#ripper-container');

    if (mode === 'search') {
      await waitViewExitTransition(ripperEl);
      if (ripperEl) {
        ripperEl.classList.remove('is-mode-out');
        ripperEl.hidden = true;
      }
      this.ripperMode.hide();
      await playViewEnterTransition(searchEl);
      this.searchMode.show();
    } else {
      await waitViewExitTransition(searchEl);
      if (searchEl) {
        searchEl.classList.remove('is-mode-out');
        searchEl.hidden = true;
      }
      this.searchMode.hide();
      await playViewEnterTransition(ripperEl);
      this.ripperMode.show();
    }

    this.currentMode = mode;
  }

  async showProxyModal() {
    await this.proxyModal.show();

    // Callback quand proxy sélectionné
    this.proxyModal.onSelect = (proxy) => {
      this.updateProxyButton();
    };
  }

  async updateProxyButton() {
    const btn = $('#refresh-proxy-btn');
    if (!btn) return;

    try {
      const response = await fetch('/api/proxy-status');
      const data = await response.json();

      if (data.enabled && data.country) {
        btn.textContent = `Proxy: ${data.country}`;
        btn.title = `${data.country} - ${data.city}`;
      } else {
        btn.textContent = 'Proxy';
        btn.title = 'Sélectionner un proxy';
      }
    } catch (error) {
      btn.textContent = 'Proxy';
    }
  }
}

// Démarrer l'app
new App();
