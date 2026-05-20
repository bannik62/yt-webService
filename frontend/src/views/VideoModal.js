import { createElement } from '../utils/dom.js';
import { isInAppSocialBrowser, openYoutubeExternally } from '../utils/inAppBrowser.js';
import { createPacmanLoaderMarkup } from '../utils/pacmanLoader.js';
import {
  escapeHtml,
  formatDuration,
  formatUploadDate,
  formatViewCount,
} from '../utils/formatters.js';

/** Charge l’API IFrame (une fois) pour recevoir les événements fin de lecture */
function loadYoutubeIframeAPI() {
  if (window.YT?.Player) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') prev();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
}

/**
 * @param {string | undefined} url
 * @param {object | null | undefined} item
 * @returns {string|null}
 */
function resolveVideoId(url, item) {
  if (item?.id && /^[a-zA-Z0-9_-]{11}$/.test(String(item.id))) {
    return String(item.id);
  }
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && /^[a-zA-Z0-9_-]{11}$/.test(match[1])) return match[1];
  }
  return null;
}

/**
 * @param {object | null | undefined} item
 * @param {object | null | undefined} meta
 */
function buildMetaDisplay(item, meta) {
  const duration =
    meta?.duration != null
      ? formatDuration(meta.duration)
      : item?.duration != null && item.duration > 0
        ? formatDuration(item.duration)
        : '';

  const uploaded =
    formatUploadDate(meta?.uploadedAt ?? item?.uploadedAt) || '';

  const views = formatViewCount(meta?.viewCount);

  const channelRaw = meta?.channel ?? item?.channel;
  const channel =
    channelRaw && String(channelRaw).trim() && String(channelRaw).trim() !== '—'
      ? String(channelRaw).trim()
      : '';

  const parts = [];
  if (uploaded) parts.push(uploaded);
  if (duration && duration !== '—') parts.push(duration);
  if (views) parts.push(views);
  if (channel) parts.push(channel);

  const summary =
    meta?.descriptionPreview && String(meta.descriptionPreview).trim()
      ? String(meta.descriptionPreview).trim()
      : null;

  return {
    lines: parts,
    summary,
    isEmpty: parts.length === 0 && !summary,
  };
}

/**
 * Lecteur vidéo : modal pleine ou mini-player docké (app utilisable pendant la lecture).
 */
export class VideoModal {
  /**
   * @param {import('../api/ApiClient.js').ApiClient | null} [api]
   */
  constructor(api = null) {
    this.api = api;
    this.currentItem = null;
    this.playlist = null;
    this.currentIndex = 0;
    this.onAdd = null;
    this.onNext = null;
    this.onPrevious = null;
    /** @type {import('../models/Favorites.js').Favorites | null} */
    this.favorites = null;
    /** @type {(() => void) | null} */
    this.onFavoriteChange = null;

    /** @type {'expanded' | 'docked' | null} */
    this._mode = null;
    /** @type {HTMLElement | null} */
    this._shell = null;
    /** @type {HTMLElement | null} */
    this._overlay = null;
    /** @type {HTMLElement | null} */
    this._modalTitleEl = null;
    /** @type {HTMLElement | null} */
    this._dockTitleEl = null;
    /** @type {HTMLElement | null} */
    this._metaEl = null;
    /** @type {HTMLElement | null} */
    this._playerSlotExpanded = null;
    /** @type {HTMLElement | null} */
    this._playerSlotDock = null;
    /** @type {HTMLElement | null} */
    this._playerHost = null;
    /** @type {HTMLElement | null} */
    this._playerLoadingEl = null;
    /** @type {HTMLElement | null} */
    this._playerFloat = null;
    /** @type {ResizeObserver | null} */
    this._layoutObserver = null;
    /** @type {HTMLElement | null} */
    this._modalBodyEl = null;
    /** @type {HTMLElement | null} */
    this._modalContentEl = null;
    /** @type {HTMLElement | null} */
    this._footerMainEl = null;
    /** @type {HTMLElement | null} */
    this._dockActionsEl = null;
    /** @type {HTMLElement | null} */
    this._dockFavBtn = null;
    /** @type {HTMLElement | null} */
    this._dockEl = null;
    /** @type {boolean} */
    this._dockDragBound = false;

    this._ytPlayer = null;
    /** @type {string | null} */
    this._loadedVideoId = null;
    /** @type {boolean} */
    this._playerReady = false;
    /** @type {string | null} */
    this._pendingVideoId = null;
    /** @type {number} */
    this._metaLoadGen = 0;
    /** @type {AbortController | null} */
    this._metaAbort = null;
    /** @type {((e: KeyboardEvent) => void) | null} */
    this._escHandler = null;
  }

  /**
   * @param {object} item
   * @param {Array | null} [playlist]
   * @param {number} [index]
   */
  show(item, playlist = null, index = 0) {
    this.currentItem = item;
    this.playlist = playlist;
    this.currentIndex = index;

    const videoId = resolveVideoId(item?.url, item);
    if (!videoId) {
      alert('URL YouTube invalide');
      return;
    }

    this._ensureShell();
    this._setMode('expanded');
    this._updateTitles();
    this._updateFooter();
    this._updateDockActions();
    this._setPlayerLoading(true);
    void this._attachPlayer(videoId);
    void this._loadVideoMeta(videoId, item);
  }

  /**
   * Met à jour titre / meta sans rouvrir la modal (ex. après probe lien partagé).
   * @param {object} patch
   */
  updateFromItem(patch) {
    if (!patch || !this.currentItem) return;
    const prevId = resolveVideoId(this.currentItem?.url, this.currentItem);
    this.currentItem = { ...this.currentItem, ...patch };
    this._updateTitles();
    this._updateFooter();
    this._updateDockActions();
    const videoId = resolveVideoId(this.currentItem?.url, this.currentItem);
    if (videoId && videoId === prevId) {
      void this._loadVideoMeta(videoId, this.currentItem);
    }
  }

  minimize() {
    if (!this._shell || !this.currentItem) return;
    this._setMode('docked');
  }

  expand() {
    if (!this._shell || !this.currentItem) return;
    this._setMode('expanded');
  }

  close() {
    this._metaLoadGen += 1;
    if (this._metaAbort) {
      this._metaAbort.abort();
      this._metaAbort = null;
    }
    this._destroyYtPlayer();
    this._removeEscHandler();
    if (this._shell) {
      this._shell.remove();
      this._shell = null;
    }
    document.body.classList.remove('has-video-dock');
    this._mode = null;
        this.currentItem = null;
        this.playlist = null;
        this.currentIndex = 0;
    this._overlay = null;
    this._modalTitleEl = null;
    this._dockTitleEl = null;
    this._metaEl = null;
    this._modalBodyEl = null;
    this._modalContentEl = null;
    this._playerSlotExpanded = null;
    this._playerSlotDock = null;
    this._playerHost = null;
    this._playerFloat = null;
    this._playerLoadingEl = null;
    if (this._layoutObserver) {
      this._layoutObserver.disconnect();
      this._layoutObserver = null;
    }
    this._footerMainEl = null;
    this._dockActionsEl = null;
    this._dockFavBtn = null;
    this._dockEl = null;
    this._dockDragBound = false;
    this._loadedVideoId = null;
    this._playerReady = false;
    this._pendingVideoId = null;
  }

  showNext() {
    if (!this.playlist || this.currentIndex >= this.playlist.length - 1) return;
    this.currentIndex++;
    this.currentItem = this.playlist[this.currentIndex];
    this._applyTrackChange();
    if (this.onNext) this.onNext(this.currentIndex);
  }

  showPrevious() {
    if (!this.playlist || this.currentIndex <= 0) return;
    this.currentIndex--;
    this.currentItem = this.playlist[this.currentIndex];
    this._applyTrackChange();
    if (this.onPrevious) this.onPrevious(this.currentIndex);
  }

  _applyTrackChange() {
    const videoId = resolveVideoId(this.currentItem?.url, this.currentItem);
    if (!videoId) return;
    this._updateTitles();
    this._updateFooter();
    this._updateDockActions();
    this._setPlayerLoading(true);
    void this._attachPlayer(videoId);
    void this._loadVideoMeta(videoId, this.currentItem);
  }

  /**
   * @param {boolean} visible
   */
  _setPlayerLoading(visible) {
    if (!this._playerLoadingEl) return;
    this._playerLoadingEl.hidden = !visible;
  }

  _setMode(mode) {
    this._mode = mode;
    if (!this._shell || !this._overlay) return;

    this._shell.classList.toggle('is-expanded', mode === 'expanded');
    this._shell.classList.toggle('is-docked', mode === 'docked');
    document.body.classList.toggle('has-video-dock', mode === 'docked');

    if (mode === 'expanded') {
      requestAnimationFrame(() => {
        this._overlay?.classList.add('show');
        this._layoutPlayerFloat();
        requestAnimationFrame(() => this._layoutPlayerFloat());
      });
    } else {
      this._overlay?.classList.remove('show');
      requestAnimationFrame(() => {
        this._placeDockDefault();
        this._layoutPlayerFloat();
      });
    }
  }

  /**
   * Modèle « float-only » : l’iframe reste dans `.video-player-float` — on ne fait que positionner le float
   * au-dessus du trou modal ou du dock (évite reparent DOM / iframe YouTube noir ou contrôles HS).
   *
   * @see docs/VIDEO-MODAL-YOUTUBE-DOCK.md — ne pas réintroduire appendChild du host entre slot et float.
   */
  _layoutPlayerFloat() {
    if (!this._playerFloat || !this._mode) return;

    const target =
      this._mode === 'docked' ? this._playerSlotDock : this._playerSlotExpanded;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      requestAnimationFrame(() => this._layoutPlayerFloat());
      return;
    }

    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const floatEl = this._playerFloat;

    floatEl.hidden = false;
    floatEl.style.left = `${rect.left}px`;
    floatEl.style.top = `${rect.top}px`;
    floatEl.style.width = `${w}px`;
    floatEl.style.height = `${h}px`;
    floatEl.style.zIndex = this._mode === 'docked' ? '9001' : '10001';

    if (this._ytPlayer?.setSize && this._playerReady && w > 0 && h > 0) {
      try {
        this._ytPlayer.setSize(w, h);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Recaler le float après reflow modal (footer/meta, centrage overlay).
   * ResizeObserver sur le slot seul ne suffit pas si la fenêtre vidéo bouge sans changer de taille.
   */
  _scheduleVideoFloatLayout() {
    if (!this._shell || this._mode !== 'expanded') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._layoutPlayerFloat());
    });
  }

  _bindPlayerLayoutWatch() {
    if (this._layoutObserver) return;

    const relayout = () => {
      if (this._mode) this._layoutPlayerFloat();
    };

    if (typeof ResizeObserver !== 'undefined') {
      this._layoutObserver = new ResizeObserver(relayout);
      if (this._playerSlotExpanded) {
        this._layoutObserver.observe(this._playerSlotExpanded);
      }
      if (this._playerSlotDock) {
        this._layoutObserver.observe(this._playerSlotDock);
      }
      if (this._dockEl) {
        this._layoutObserver.observe(this._dockEl);
      }
      if (this._modalContentEl) {
        this._layoutObserver.observe(this._modalContentEl);
      }
    }

    window.addEventListener('resize', relayout);
    document.querySelector('.main-content')?.addEventListener('scroll', relayout, {
      passive: true,
    });
    this._metaEl?.addEventListener('scroll', relayout, { passive: true });
  }

  _placeDockDefault() {
    const dock = this._dockEl;
    if (!dock || this._mode !== 'docked') return;
    if (dock.style.left && dock.style.top) return;

    const rect = dock.getBoundingClientRect();
    const w = rect.width || 360;
    const h = rect.height || 100;
    const pad = 12;
    const left = window.innerWidth - w - pad;
    const top = window.innerHeight - h - pad;
    const clamped = this._clampDockPosition(left, top);
    dock.style.left = `${clamped.left}px`;
    dock.style.top = `${clamped.top}px`;
  }

  /**
   * @param {number} left
   * @param {number} top
   */
  _clampDockPosition(left, top) {
    const dock = this._dockEl;
    if (!dock) return { left, top };

    const rect = dock.getBoundingClientRect();
    const w = rect.width || dock.offsetWidth || 320;
    const h = rect.height || dock.offsetHeight || 100;
    const pad = 8;
    const maxLeft = Math.max(pad, window.innerWidth - w - pad);
    const maxTop = Math.max(pad, window.innerHeight - h - pad);

    return {
      left: Math.min(Math.max(pad, left), maxLeft),
      top: Math.min(Math.max(pad, top), maxTop),
    };
  }

  /**
   * @param {HTMLElement} dockEl
   */
  _bindDockDrag(dockEl) {
    if (this._dockDragBound) return;
    this._dockDragBound = true;

    const header = dockEl.querySelector('.video-player-dock__header');
    if (!header) return;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;

      const rect = dockEl.getBoundingClientRect();
      dockEl.style.right = 'auto';
      dockEl.style.bottom = 'auto';
      dockEl.style.left = `${rect.left}px`;
      dockEl.style.top = `${rect.top}px`;

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      dockEl.classList.add('is-dragging');
      header.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const next = this._clampDockPosition(startLeft + dx, startTop + dy);
      dockEl.style.left = `${next.left}px`;
      dockEl.style.top = `${next.top}px`;
      this._layoutPlayerFloat();
    };

    const onPointerUp = (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      dockEl.classList.remove('is-dragging');
      try {
        header.releasePointerCapture(e.pointerId);
      } catch {
        /* déjà relâché */
      }
      this._layoutPlayerFloat();
    };

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', () => {
      if (!dockEl.style.left || !dockEl.style.top) return;
      const left = Number.parseFloat(dockEl.style.left) || 0;
      const top = Number.parseFloat(dockEl.style.top) || 0;
      const next = this._clampDockPosition(left, top);
      dockEl.style.left = `${next.left}px`;
      dockEl.style.top = `${next.top}px`;
      this._layoutPlayerFloat();
    });
  }

  _ensureShell() {
    if (this._shell) return;

    const shellRoot = createElement('div', { className: 'video-player-shell' });

    const overlayEl = createElement('div', {
      className: 'modal-overlay video-player-overlay',
      onClick: () => this.minimize(),
    });

    const modalContent = createElement('div', {
      className: 'modal-content video-player-modal-content',
      onClick: (e) => e.stopPropagation(),
    });
    this._modalContentEl = modalContent;

    const header = createElement('div', { className: 'modal-header' });
    this._modalTitleEl = createElement('h2', {
      className: 'modal-title',
    });
    header.appendChild(this._modalTitleEl);

    const headerActions = createElement('div', {
      className: 'video-player-header-actions',
    });
    headerActions.appendChild(
      createElement(
        'button',
        {
          className: 'video-player-chrome-btn',
          type: 'button',
          title: 'Réduire et continuer dans l’app',
          'aria-label': 'Réduire le lecteur',
          onClick: () => this.minimize(),
        },
        '▾'
      )
    );
    headerActions.appendChild(
      createElement(
        'button',
        {
      className: 'modal-close',
      type: 'button',
          title: 'Fermer la lecture',
          'aria-label': 'Fermer',
          onClick: () => this.close(),
        },
        '×'
      )
    );
    header.appendChild(headerActions);

    const body = createElement('div', {
      className: 'modal-body video-player-modal-body',
    });
    this._modalBodyEl = body;
    const videoBox = createElement('div', { className: 'video-container' });
    this._playerSlotExpanded = createElement('div', {
      className: 'video-container-inner video-player-slot-target',
    });
    videoBox.appendChild(this._playerSlotExpanded);
    body.appendChild(videoBox);

    this._footerMainEl = createElement('div', {
      className: 'video-player-modal-toolbar',
    });
    this._metaEl = createElement('div', {
      className: 'modal-video-meta',
      'aria-live': 'polite',
    });

    const modalFooter = createElement('div', {
      className: 'modal-footer video-player-modal-footer',
    });
    modalFooter.appendChild(this._footerMainEl);
    modalFooter.appendChild(this._metaEl);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(modalFooter);
    overlayEl.appendChild(modalContent);

    this._playerHost = createElement('div', {
      className: 'video-container-host',
      id: `yt-player-host-${Date.now()}`,
    });

    const dock = createElement('div', {
      className: 'video-player-dock',
      onClick: (e) => e.stopPropagation(),
    });

    this._playerSlotDock = createElement('div', {
      className: 'video-player-dock__media video-player-slot-target',
    });
    dock.appendChild(this._playerSlotDock);

    const dockBodyEl = createElement('div', { className: 'video-player-dock__body' });
    const dockDragHeader = createElement('div', {
      className: 'video-player-dock__header',
      title: 'Déplacer le lecteur',
    });
    dockDragHeader.appendChild(
      createElement('span', {
        className: 'video-player-dock__grip',
        'aria-hidden': 'true',
      }, '⠿')
    );
    this._dockTitleEl = createElement('p', {
      className: 'video-player-dock__title',
    });
    dockDragHeader.appendChild(this._dockTitleEl);
    dockBodyEl.appendChild(dockDragHeader);
    this._dockActionsEl = createElement('div', {
      className: 'video-player-dock__actions',
    });
    dockBodyEl.appendChild(this._dockActionsEl);

    const dockChrome = createElement('div', {
      className: 'video-player-dock__chrome',
    });
    dockChrome.appendChild(
      createElement(
        'button',
        {
          className: 'video-player-chrome-btn',
          type: 'button',
          title: 'Agrandir',
          'aria-label': 'Agrandir le lecteur',
          onClick: () => this.expand(),
        },
        '⛶'
      )
    );
    dockChrome.appendChild(
      createElement(
        'button',
        {
          className: 'modal-close',
          type: 'button',
          title: 'Fermer',
          'aria-label': 'Fermer',
          onClick: () => this.close(),
        },
        '×'
      )
    );
    dock.appendChild(dockBodyEl);
    dock.appendChild(dockChrome);

    this._playerFloat = createElement('div', {
      className: 'video-player-float',
      hidden: true,
    });
    this._playerFloat.appendChild(this._playerHost);

    this._playerLoadingEl = createElement('div', {
      className: 'video-player-loading pacman-loader-host',
      hidden: true,
      'aria-live': 'polite',
    });
    this._playerLoadingEl.appendChild(createPacmanLoaderMarkup());
    const loadingLabel = createElement('span', {
      className: 'search-loading-label',
    });
    loadingLabel.textContent = 'Chargement de la vidéo…';
    this._playerLoadingEl.appendChild(loadingLabel);
    this._playerFloat.appendChild(this._playerLoadingEl);

    shellRoot.appendChild(overlayEl);
    shellRoot.appendChild(dock);
    shellRoot.appendChild(this._playerFloat);
    document.body.appendChild(shellRoot);

    this._shell = shellRoot;
    this._overlay = overlayEl;
    this._dockEl = dock;

    this._bindDockDrag(dock);
    this._bindPlayerLayoutWatch();
    this._bindEscHandler();
  }

  _bindEscHandler() {
    this._removeEscHandler();
    this._escHandler = (e) => {
      if (e.key !== 'Escape' || !this._shell) return;
      if (this._mode === 'expanded') {
        this.minimize();
      } else {
        this.close();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  }

  _removeEscHandler() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }

  _updateTitles() {
    if (this._modalTitleEl) {
      this._modalTitleEl.textContent = this.currentItem?.title || 'Vidéo';
    }
    if (this._dockTitleEl) {
      this._dockTitleEl.textContent = this.currentItem?.title || 'Vidéo';
      this._dockTitleEl.title = this.currentItem?.title || '';
    }
  }

  _updateFooter() {
    if (!this._footerMainEl) return;
    this._footerMainEl.innerHTML = '';

    const hasPlaylistNav = this.playlist && this.playlist.length > 1;

    if (hasPlaylistNav) {
            const navigation = createElement('div', { className: 'modal-nav' });
      navigation.appendChild(
        createElement(
          'button',
          {
            className: 'btn btn-secondary',
            type: 'button',
            disabled: this.currentIndex === 0,
            onClick: () => this.showPrevious(),
          },
          '← Précédent'
        )
      );
      navigation.appendChild(
        createElement(
          'span',
          { className: 'modal-counter' },
          `${this.currentIndex + 1} / ${this.playlist.length}`
        )
      );
      navigation.appendChild(
        createElement(
          'button',
          {
            className: 'btn btn-secondary',
            type: 'button',
            disabled: this.currentIndex === this.playlist.length - 1,
            onClick: () => this.showNext(),
          },
          'Suivant →'
        )
      );
      this._footerMainEl.appendChild(navigation);
    }

    if (isInAppSocialBrowser()) {
      const videoId = resolveVideoId(this.currentItem?.url, this.currentItem);
      if (videoId) {
        const hint = createElement('p', {
          className: 'video-player-inapp-hint',
        });
        hint.textContent =
          'Dans Messenger ou l’app Facebook, la lecture intégrée est souvent bloquée.';
        this._footerMainEl.appendChild(hint);
        this._footerMainEl.appendChild(
          createElement(
            'button',
            {
              className: 'btn btn-primary btn-large btn-open-youtube-external',
              type: 'button',
              onClick: () => openYoutubeExternally(videoId),
            },
            '▶ Ouvrir sur YouTube'
          )
        );
      }
    }

    const actions = createElement('div', { className: 'video-player-modal-actions' });

    if (!hasPlaylistNav) {
      actions.appendChild(
        createElement(
          'button',
          {
            className: 'btn btn-primary btn-large',
            type: 'button',
            onClick: () => {
              if (this.onAdd) this.onAdd(this.currentItem);
            },
          },
          '➕ Ajouter à ma liste'
        )
      );
    } else {
      actions.appendChild(
        createElement(
          'button',
          {
            className: 'btn btn-secondary',
            type: 'button',
            onClick: () => {
              if (this.onAdd) this.onAdd(this.currentItem);
            },
          },
          '➕ Liste'
        )
      );
    }

    actions.appendChild(this._createFavoriteButton(false));
    actions.appendChild(
      createElement(
        'button',
        {
          className: 'btn btn-secondary',
          type: 'button',
          onClick: () => this.minimize(),
        },
        '▾ Réduire'
      )
    );

    this._footerMainEl.appendChild(actions);
    this._scheduleVideoFloatLayout();
  }

  /**
   * @param {boolean} dockCompact
   */
  _createFavoriteButton(dockCompact) {
    const videoId = resolveVideoId(this.currentItem?.url, this.currentItem);
    const isFav = videoId && this.favorites?.isFavorite(videoId);
    const btn = createElement('button', {
      type: 'button',
      className: `video-player-fav-btn${isFav ? ' is-active' : ''}`,
      title: isFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
      'aria-label': isFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
      'aria-pressed': isFav ? 'true' : 'false',
    });
    btn.textContent = dockCompact ? '★' : '★ Favori';
    btn.addEventListener('click', () => {
      if (!this.favorites || !this.currentItem) return;
      const added = this.favorites.toggle(this.currentItem);
      btn.classList.toggle('is-active', added);
      btn.setAttribute('aria-pressed', added ? 'true' : 'false');
      btn.title = added ? 'Retirer des favoris' : 'Ajouter aux favoris';
      if (!dockCompact) {
        btn.textContent = added ? '★ Favori' : '☆ Favori';
      }
      this.onFavoriteChange?.();
    });
    if (dockCompact) this._dockFavBtn = btn;
    return btn;
  }

  _updateDockActions() {
    if (!this._dockActionsEl) return;
    this._dockActionsEl.innerHTML = '';
    this._dockFavBtn = null;

    const hasPlaylistNav = this.playlist && this.playlist.length > 1;

    if (hasPlaylistNav) {
      this._dockActionsEl.appendChild(
        createElement(
          'button',
          {
            className: 'video-player-dock-btn',
            type: 'button',
            disabled: this.currentIndex === 0,
            title: 'Précédent',
            onClick: () => this.showPrevious(),
          },
          '‹'
        )
      );
    }

    this._dockActionsEl.appendChild(
      createElement(
        'button',
        {
          className: 'video-player-dock-btn video-player-dock-btn--add',
          type: 'button',
          title: 'Ajouter à la liste',
          onClick: () => {
            if (this.onAdd) this.onAdd(this.currentItem);
          },
        },
        '+'
      )
    );

    this._dockActionsEl.appendChild(this._createFavoriteButton(true));

    if (hasPlaylistNav) {
      this._dockActionsEl.appendChild(
        createElement(
          'button',
          {
            className: 'video-player-dock-btn',
            type: 'button',
            disabled: this.currentIndex === this.playlist.length - 1,
            title: 'Suivant',
            onClick: () => this.showNext(),
          },
          '›'
        )
      );
    }
  }

  async _attachPlayer(videoId) {
    if (!this._playerHost) return;

    if (this._ytPlayer && this._playerReady && this._loadedVideoId === videoId) {
      return;
    }

    if (this._ytPlayer && this._playerReady && this._loadedVideoId !== videoId) {
      this._setPlayerLoading(true);
      this._loadedVideoId = videoId;
      this._ytPlayer.loadVideoById(videoId);
      return;
    }

    if (this._ytPlayer && !this._playerReady) {
      this._pendingVideoId = videoId;
      return;
    }

    await loadYoutubeIframeAPI();
    if (!this._playerHost?.isConnected) return;

    this._pendingVideoId = videoId;
    this._playerReady = false;

    const hostId = this._playerHost.id;
    if (!hostId) return;

        this._ytPlayer = new window.YT.Player(hostId, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            rel: 0,
        modestbranding: 1,
          },
          events: {
        onReady: () => {
          this._playerReady = true;
          this._loadedVideoId = videoId;
          if (this._pendingVideoId && this._pendingVideoId !== videoId) {
            const next = this._pendingVideoId;
            this._loadedVideoId = next;
            this._ytPlayer?.loadVideoById(next);
          }
          this._pendingVideoId = null;
          this._setPlayerLoading(false);
          this._layoutPlayerFloat();
        },
            onStateChange: (e) => {
              const st = e.data;
              if (
                st === window.YT.PlayerState.PLAYING ||
                st === window.YT.PlayerState.BUFFERING ||
                st === window.YT.PlayerState.CUED
              ) {
                this._setPlayerLoading(false);
              }
              if (st !== window.YT.PlayerState.ENDED) return;
              if (
                this.playlist &&
                this.currentIndex < this.playlist.length - 1
              ) {
                this.showNext();
              }
        },
      },
    });
  }

  _destroyYtPlayer() {
    if (this._ytPlayer) {
      try {
        this._ytPlayer.destroy();
      } catch {
        /* ignore */
      }
      this._ytPlayer = null;
    }
    this._loadedVideoId = null;
    this._playerReady = false;
    this._pendingVideoId = null;
  }

  /**
   * @param {HTMLElement} metaEl
   * @param {'loading' | 'content' | 'error' | 'empty'} state
   * @param {{ lines?: string[], summary?: string | null, message?: string }} [opts]
   */
  _setMetaPanel(metaEl, state, opts = {}) {
    metaEl.innerHTML = '';
    metaEl.classList.remove('is-loading', 'is-error', 'is-empty');

    if (state === 'loading') {
      metaEl.classList.add('is-loading');
      metaEl.textContent = 'Chargement des infos…';
      this._scheduleVideoFloatLayout();
      return;
    }

    if (state === 'error') {
      metaEl.classList.add('is-error');
      metaEl.textContent = opts.message || 'Infos indisponibles';
      this._scheduleVideoFloatLayout();
      return;
    }

    if (state === 'empty') {
      metaEl.classList.add('is-empty');
      metaEl.textContent = 'Aucune info complémentaire';
      this._scheduleVideoFloatLayout();
      return;
    }

    const lines = opts.lines ?? [];
    if (lines.length > 0) {
      const lineEl = createElement('div', { className: 'modal-video-meta-line' });
      lineEl.textContent = lines.join(' · ');
      metaEl.appendChild(lineEl);
    }

    if (opts.summary) {
      this._appendExpandableSummary(metaEl, opts.summary);
    }
    this._scheduleVideoFloatLayout();
  }

  _appendExpandableSummary(metaEl, summaryText) {
    const text = String(summaryText).trim();
    if (!text) return;

    const summaryWrap = createElement('div', {
      className: 'modal-video-meta-summary-wrap',
    });
    const summaryInnerEl = createElement('div', {
      className: 'modal-video-meta-summary-inner',
    });
    const p = createElement('p', { className: 'modal-video-meta-summary' });
    p.textContent = text;
    summaryInnerEl.appendChild(p);
    summaryWrap.appendChild(summaryInnerEl);

    const needsToggle = text.length > 180 || text.includes('\n');
    if (!needsToggle) {
      summaryWrap.classList.add('is-expanded');
      metaEl.appendChild(summaryWrap);
      return;
    }

    const btn = createElement('button', {
      type: 'button',
      className: 'modal-video-meta-more',
      'aria-expanded': 'false',
    });
    btn.textContent = 'Voir plus';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const expanded = !summaryWrap.classList.contains('is-expanded');
      summaryWrap.classList.toggle('is-expanded', expanded);
      btn.textContent = expanded ? 'Voir moins' : 'Voir plus';
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      this._scheduleVideoFloatLayout();
    });
    summaryWrap.appendChild(btn);
    metaEl.appendChild(summaryWrap);
  }

  async _loadVideoMeta(videoId, item) {
    if (!this._metaEl) return;

    if (this._metaAbort) {
      this._metaAbort.abort();
    }
    this._metaAbort = new AbortController();
    this._metaLoadGen += 1;
    const loadGen = this._metaLoadGen;
    const metaEl = this._metaEl;

    const initial = buildMetaDisplay(item, null);
    if (!initial.isEmpty) {
      this._setMetaPanel(metaEl, 'content', {
        lines: initial.lines,
        summary: null,
      });
    } else {
      this._setMetaPanel(metaEl, 'loading');
    }

    if (!this.api?.fetchVideoMeta) {
      if (initial.isEmpty) {
        this._setMetaPanel(metaEl, 'empty');
      }
      return;
    }

    const meta = await this.api.fetchVideoMeta(videoId, {
      signal: this._metaAbort?.signal,
    });
    if (loadGen !== this._metaLoadGen || !metaEl.isConnected) {
      return;
    }

    if (meta?.error && meta.available === false) {
      const msg =
        typeof meta.error === 'string' && meta.error.trim()
          ? meta.error.trim()
          : 'Infos indisponibles';
      if (initial.isEmpty) {
        this._setMetaPanel(metaEl, 'error', { message: msg });
      } else {
                const warning = createElement('div', {
          className: 'modal-video-meta-line modal-video-meta-line--warn',
        });
        warning.textContent = msg;
        metaEl.appendChild(warning);
        this._scheduleVideoFloatLayout();
      }
      return;
    }

    const display = buildMetaDisplay(item, meta);
    if (display.isEmpty) {
      this._setMetaPanel(metaEl, 'empty');
      return;
    }

    this._setMetaPanel(metaEl, 'content', {
      lines: display.lines,
      summary: display.summary,
    });
  }
}
