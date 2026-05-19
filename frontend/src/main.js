import { $ } from './utils/dom.js';
import { ApiClient } from './api/ApiClient.js';
import { SearchMode } from './modes/SearchMode.js';
import { RipperMode } from './modes/RipperMode.js';
import { ProxyModal } from './views/ProxyModal.js';

/**
 * Classes sur `body` pour le mode courant (FAB liste = mobile + recherche).
 * @param {'search' | 'ripper'} mode
 */
function syncBodyModeClasses(mode) {
  document.body.classList.toggle('mode-search', mode === 'search');
  document.body.classList.toggle('mode-ripper', mode === 'ripper');
}

function closePlaylistSheet() {
  document.body.classList.remove('playlist-sheet-open');
  const fab = $('#playlist-fab');
  const backdrop = $('#playlist-sheet-backdrop');
  if (fab) {
    fab.setAttribute('aria-expanded', 'false');
    fab.classList.remove('playlist-fab--open');
    fab.setAttribute('aria-label', 'Ouvrir ma liste de téléchargement');
  }
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

function openPlaylistSheet() {
  document.body.classList.add('playlist-sheet-open');
  const fab = $('#playlist-fab');
  const backdrop = $('#playlist-sheet-backdrop');
  if (fab) {
    fab.setAttribute('aria-expanded', 'true');
    fab.classList.add('playlist-fab--open');
    fab.setAttribute('aria-label', 'Fermer ma liste de téléchargement');
  }
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
  }
  const sheet = $('#download-list');
  if (sheet) {
    const play = $('#download-list-play');
    if (play instanceof HTMLElement && !play.disabled) {
      play.focus();
    } else {
      if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1');
      sheet.focus();
    }
  }
}

function initPlaylistFab() {
  const fab = $('#playlist-fab');
  const backdrop = $('#playlist-sheet-backdrop');
  if (!fab || !backdrop) return;

  fab.addEventListener('click', () => {
    if (document.body.classList.contains('playlist-sheet-open')) {
      closePlaylistSheet();
      fab.focus();
    } else {
      openPlaylistSheet();
    }
  });

  backdrop.addEventListener('click', () => {
    closePlaylistSheet();
    fab.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'Escape' &&
      document.body.classList.contains('playlist-sheet-open')
    ) {
      closePlaylistSheet();
      fab.focus();
    }
  });
}

const PLAYLIST_RAIL_STORAGE_KEY = 'yt-playlist-rail-collapsed';

function isDesktopSearchMode() {
  try {
    return (
      window.matchMedia('(min-width: 769px)').matches &&
      document.body.classList.contains('mode-search')
    );
  } catch {
    return (
      window.innerWidth >= 769 &&
      document.body.classList.contains('mode-search')
    );
  }
}

/**
 * Affiche / synchronise le bouton repli playlist (desktop + mode Recherche).
 */
export function syncPlaylistRailToggle() {
  const btn = $('#playlist-rail-toggle');
  if (!btn) return;

  if (!isDesktopSearchMode()) {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;
  const collapsed = document.body.classList.contains('playlist-rail-collapsed');
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute(
    'aria-label',
    collapsed ? 'Afficher ma liste' : 'Masquer ma liste'
  );
}

function initPlaylistRailToggle() {
  const btn = $('#playlist-rail-toggle');
  if (!btn) return;

  if (localStorage.getItem(PLAYLIST_RAIL_STORAGE_KEY) === '1') {
    document.body.classList.add('playlist-rail-collapsed');
  }

  btn.addEventListener('click', () => {
    if (!isDesktopSearchMode()) return;
    document.body.classList.toggle('playlist-rail-collapsed');
    localStorage.setItem(
      PLAYLIST_RAIL_STORAGE_KEY,
      document.body.classList.contains('playlist-rail-collapsed')
        ? '1'
        : '0'
    );
    syncPlaylistRailToggle();
  });

  window.addEventListener('resize', syncPlaylistRailToggle);
  syncPlaylistRailToggle();
}

/** Seuil (px) : au-delà, le bandeau sticky prend un aspect « verre » (glassmorphism). */
const STICKY_SCROLL_GLASS_PX = 8;

/**
 * Bandeau haut (sticky) : fond vitré lorsque l’utilisateur a commencé à défiler.
 * Scroll dans `.main-content` (desktop et mobile).
 */
function initStickyTopScrollGlass() {
  const main = document.querySelector('.main-content');
  const pageTop = document.querySelector('.search-page-top');
  const mobileBand = document.querySelector('.search-mobile-sticky-band');
  if (!pageTop) return;

  const isDesktop = () => {
    try {
      return window.matchMedia('(min-width: 769px)').matches;
    } catch {
      return window.innerWidth >= 769;
    }
  };

  const sync = () => {
    const desk = isDesktop();
    const depth = main ? main.scrollTop : 0;
    const on = depth > STICKY_SCROLL_GLASS_PX;
    pageTop.classList.toggle('search-page-top--glass', desk && on);
    mobileBand?.classList.toggle('search-mobile-sticky-band--glass', !desk && on);
  };

  main?.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  sync();
}

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

    // Lien profond ?v=VIDEOID : forcer le mode recherche avant lecture des radios
    const shareV = new URLSearchParams(window.location.search).get('v');
    if (shareV && /^[a-zA-Z0-9_-]{11}$/.test(shareV)) {
      const searchRadio = document.querySelector(
        'input[name="mode"][value="search"]'
      );
      const ripperRadio = document.querySelector(
        'input[name="mode"][value="ripper"]'
      );
      if (searchRadio instanceof HTMLInputElement) {
        searchRadio.checked = true;
      }
      if (ripperRadio instanceof HTMLInputElement) {
        ripperRadio.checked = false;
      }
      this.currentMode = 'search';
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

    initPlaylistFab();
    initPlaylistRailToggle();

    initStickyTopScrollGlass();

    // Lien partagé ?v= : ouvrir la modal avant d’afficher l’accueil
    if (shareV && /^[a-zA-Z0-9_-]{11}$/.test(shareV)) {
      this.handleSearchShareDeepLink();
    }

    // Afficher le mode initial (sans animation au premier rendu)
    this.switchMode(this.currentMode, { instant: true });

    if (!shareV || !/^[a-zA-Z0-9_-]{11}$/.test(shareV)) {
      this.handleSearchShareDeepLink();
    }
  }

  handleSearchShareDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    if (!v || !/^[a-zA-Z0-9_-]{11}$/.test(v)) return;

    void this.searchMode.openSharedVideoFromQuery(v).then((ok) => {
      if (!ok) return;
      params.delete('v');
      const q = params.toString();
      const next =
        window.location.pathname + (q ? `?${q}` : '') + window.location.hash;
      window.history.replaceState(null, '', next);
    });
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

    closePlaylistSheet();

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
        syncBodyModeClasses('search');
        syncPlaylistRailToggle();
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
        syncBodyModeClasses('ripper');
        syncPlaylistRailToggle();
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
    closePlaylistSheet();
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
      syncBodyModeClasses('search');
      syncPlaylistRailToggle();
    } else {
      await waitViewExitTransition(searchEl);
      if (searchEl) {
        searchEl.classList.remove('is-mode-out');
        searchEl.hidden = true;
      }
      this.searchMode.hide();
      await playViewEnterTransition(ripperEl);
      this.ripperMode.show();
      syncBodyModeClasses('ripper');
      syncPlaylistRailToggle();
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
