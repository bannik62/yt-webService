import { createElement } from '../utils/dom.js';
import { loadYoutubeIframeAPI } from '../utils/youtubeIframeApi.js';
import {
  AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH,
  ambilightPlayerVars,
  mainYoutubePlayerVars,
  muteAmbilightPlayer,
  setAmbilightPlaybackQuality,
  setAmbilightPlayerSize,
  startAmbilightSyncLoop,
  syncAmbilightState,
} from '../utils/youtubeDualAmbilight.js';
import { escapeHtml, formatDuration } from '../utils/formatters.js';

/**
 * Feed vertical Shorts : scroll-snap, un lecteur YouTube fixe (sans reparentage DOM).
 */
export class ShortsFeedView {
  constructor() {
    /** @type {object[]} */
    this.items = [];
    this.activeIndex = 0;
    /** @type {(() => Promise<object[]>) | null} */
    this.onNeedMore = null;
    /** @type {(() => void) | null} */
    this.onClose = null;
    /** @type {((item: object) => void) | null} */
    this.onFavorite = null;
    /** @type {((item: object) => void) | null} */
    this.onDownload = null;
    /** @type {((item: object) => void) | null} */
    this.onShare = null;
    /** @type {((item: object) => void) | null} */
    this.onItemActive = null;
    /** @type {import('../models/Favorites.js').Favorites | null} */
    this.favorites = null;

    this._loadingMore = false;
    /** @type {IntersectionObserver | null} */
    this._observer = null;
    /** @type {YT.Player | null} */
    this._player = null;
    this._playerReady = false;
    this._loadedVideoId = null;
    /** @type {string | null} */
    this._pendingVideoId = null;
    /** @type {HTMLElement | null} */
    this._playerHost = null;
    /** @type {HTMLElement | null} */
    this._playerLayer = null;
    /** @type {HTMLElement | null} */
    this._ambilightLayer = null;
    /** @type {HTMLElement | null} */
    this._ambilightHost = null;
    /** @type {YT.Player | null} */
    this._ambilightPlayer = null;
    this._ambilightReady = false;
    /** @type {string | null} */
    this._ambilightVideoId = null;
    /** @type {(() => void) | null} */
    this._stopAmbilightSync = null;
    /** @type {HTMLElement | null} */
    this._scrollEl = null;
    /** @type {HTMLElement | null} */
    this._trackEl = null;
    /** @type {HTMLElement | null} */
    this._root = null;
    this._activateToken = 0;
    this._onResize = () => {
      this._syncPlayerPosition();
      this._updateAmbilightMode();
    };
    this._userPaused = false;
    this._wheelCooldown = 0;

    this._buildShell();
  }

  _isFeedOpen() {
    return Boolean(this._root && !this._root.hidden);
  }

  _shouldUseAmbilight() {
    return window.innerWidth >= AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH;
  }

  _buildShell() {
    this._root = createElement('div', {
      className: 'shorts-feed-overlay',
      hidden: true,
      'aria-modal': 'true',
      role: 'dialog',
      'aria-label': 'Shorts',
    });

    const closeBtn = createElement('button', {
      type: 'button',
      className: 'shorts-feed-close',
      title: 'Fermer',
      'aria-label': 'Fermer les Shorts',
    });
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.close());

    this._ambilightLayer = createElement('div', {
      className: 'shorts-feed-ambilight-layer',
      'aria-hidden': 'true',
    });
    this._ambilightHost = createElement('div', {
      className: 'shorts-feed-ambilight-back',
      id: `shorts-yt-amb-${Date.now()}`,
    });
    this._ambilightLayer.appendChild(this._ambilightHost);

    this._scrollEl = createElement('div', {
      className: 'shorts-feed-scroll',
    });
    this._trackEl = createElement('div', { className: 'shorts-feed-track' });
    this._scrollEl.appendChild(this._trackEl);

    this._playerLayer = createElement('div', {
      className: 'shorts-feed-player-layer',
      'aria-hidden': 'true',
    });
    this._playerHost = createElement('div', {
      className: 'shorts-feed-player-host',
      id: `shorts-yt-host-${Date.now()}`,
    });
    this._playerLayer.appendChild(this._playerHost);

    this._root.appendChild(this._ambilightLayer);
    this._root.appendChild(this._scrollEl);
    this._root.appendChild(this._playerLayer);
    this._root.appendChild(closeBtn);
    document.body.appendChild(this._root);

    this._scrollEl.addEventListener(
      'scroll',
      () => {
        if (!this._isFeedOpen()) return;
        this._syncPlayerPosition();
        this._maybeLoadMore();
      },
      { passive: true }
    );

    this._bindMobileSwipe();
    this._bindWheelNav();
    this._bindFrameTap();

    document.addEventListener('keydown', this._onKeyDown);
  }

  /** Molette souris / trackpad (desktop). */
  _bindWheelNav() {
    if (!this._scrollEl) return;

    this._scrollEl.addEventListener(
      'wheel',
      (e) => {
        if (!this._isFeedOpen()) return;
        if (Math.abs(e.deltaY) < 28) return;
        e.preventDefault();
        const now = Date.now();
        if (now - this._wheelCooldown < 380) return;
        this._wheelCooldown = now;
        if (e.deltaY > 0) {
          this._scrollToIndex(this.activeIndex + 1);
        } else {
          this._scrollToIndex(this.activeIndex - 1);
        }
      },
      { passive: false }
    );
  }

  /** Clic sur la vidéo : pause / reprise (pas de contrôles YouTube). */
  _bindFrameTap() {
    if (!this._scrollEl) return;

    this._scrollEl.addEventListener('click', (e) => {
      if (!this._isFeedOpen()) return;
      if (e.target.closest('.shorts-feed-action-btn, .shorts-feed-close')) return;
      const frame = this._getFrameEl(this.activeIndex);
      if (!frame?.contains(e.target)) return;
      this._togglePlayPause();
    });
  }

  _syncAmbilightWithMain() {
    if (
      !this._ambilightPlayer ||
      !this._ambilightReady ||
      !this._player ||
      !this._playerReady
    ) {
      return;
    }
    syncAmbilightState(this._player, this._ambilightPlayer);
  }

  _togglePlayPause() {
    if (!this._player || !this._playerReady || !this._isFeedOpen()) return;
    const Y = window.YT;
    const state = this._player.getPlayerState?.();
    if (
      state === Y?.PlayerState?.PLAYING ||
      state === Y?.PlayerState?.BUFFERING
    ) {
      this._userPaused = true;
      try {
        this._player.pauseVideo?.();
      } catch {
        /* ignore */
      }
      this._syncAmbilightWithMain();
      this._setPosterVisible(this.activeIndex, true);
      return;
    }
    this._userPaused = false;
    this._setPosterVisible(this.activeIndex, false);
    try {
      this._player.playVideo?.();
    } catch {
      /* ignore */
    }
    this._syncAmbilightWithMain();
  }

  /** Swipe vertical de secours (mobile, iframe non interactive). */
  _bindMobileSwipe() {
    if (!this._scrollEl) return;
    let startY = 0;
    let startTime = 0;

    this._scrollEl.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        this._swipeScrollTop = this._scrollEl?.scrollTop ?? 0;
      },
      { passive: true }
    );

    this._scrollEl.addEventListener(
      'touchend',
      (e) => {
        if (window.innerWidth > 768 || !this._scrollEl) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dy = startY - t.clientY;
        const dt = Date.now() - startTime;
        if (dt > 600 || Math.abs(dy) < 48) return;
        if (Math.abs(this._scrollEl.scrollTop - (this._swipeScrollTop ?? 0)) > 24) {
          return;
        }
        if (dy > 0) {
          this._scrollToIndex(this.activeIndex + 1);
        } else {
          this._scrollToIndex(this.activeIndex - 1);
        }
      },
      { passive: true }
    );
  }

  _onKeyDown = (e) => {
    if (!this._isFeedOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._scrollToIndex(this.activeIndex + 1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._scrollToIndex(this.activeIndex - 1);
    }
  };

  _updateAmbilightMode() {
    const want = this._isFeedOpen() && this._shouldUseAmbilight();
    this._root?.classList.toggle('shorts-feed--ambilight', want);
    if (!want) {
      this._destroyAmbilightPlayer();
      return;
    }
    const videoId = this._loadedVideoId || this.items[this.activeIndex]?.id;
    if (videoId && this._playerReady) {
      void this._attachAmbilightPlayer(videoId);
    }
  }

  _destroyAmbilightPlayer() {
    if (this._stopAmbilightSync) {
      this._stopAmbilightSync();
      this._stopAmbilightSync = null;
    }
    if (this._ambilightPlayer) {
      try {
        this._ambilightPlayer.destroy();
      } catch {
        /* ignore */
      }
      this._ambilightPlayer = null;
    }
    this._ambilightReady = false;
    this._ambilightVideoId = null;
    if (this._ambilightHost) {
      this._ambilightHost.id = `shorts-yt-amb-${Date.now()}`;
      this._ambilightHost.innerHTML = '';
    }
  }

  _destroyMainPlayer() {
    if (this._player) {
      try {
        this._player.destroy();
      } catch {
        /* ignore */
      }
      this._player = null;
    }
    this._playerReady = false;
    this._loadedVideoId = null;
    this._pendingVideoId = null;
    if (this._playerHost) {
      this._playerHost.id = `shorts-yt-host-${Date.now()}`;
      this._playerHost.innerHTML = '';
    }
  }

  _destroyPlayers() {
    this._destroyAmbilightPlayer();
    this._destroyMainPlayer();
  }

  async _attachAmbilightPlayer(videoId) {
    if (!this._isFeedOpen() || !this._shouldUseAmbilight() || !videoId) {
      this._destroyAmbilightPlayer();
      return;
    }
    if (!this._player || !this._playerReady || !this._ambilightHost?.id) {
      return;
    }

    const ambIframe = this._ambilightPlayer?.getIframe?.();
    if (
      this._ambilightPlayer &&
      this._ambilightReady &&
      this._ambilightVideoId === videoId &&
      ambIframe &&
      this._ambilightHost.contains(ambIframe)
    ) {
      this._syncAmbilightWithMain();
      return;
    }

    this._destroyAmbilightPlayer();
    await loadYoutubeIframeAPI();
    if (
      !this._isFeedOpen() ||
      !this._shouldUseAmbilight() ||
      !this._ambilightHost?.isConnected
    ) {
      return;
    }

    const hostId = this._ambilightHost.id;
    if (!hostId) return;

    this._ambilightPlayer = new window.YT.Player(hostId, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: ambilightPlayerVars(),
      events: {
        onReady: () => {
          if (!this._isFeedOpen()) {
            this._destroyAmbilightPlayer();
            return;
          }
          this._ambilightReady = true;
          this._ambilightVideoId = videoId;
          const back = this._ambilightPlayer;
          const main = this._player;
          if (!back || !main) return;
          muteAmbilightPlayer(back);
          setAmbilightPlayerSize(back, {
            width: window.innerWidth,
            height: window.innerHeight,
          });
          setAmbilightPlaybackQuality(back);
          syncAmbilightState(main, back);
          if (this._stopAmbilightSync) this._stopAmbilightSync();
          this._stopAmbilightSync = startAmbilightSyncLoop(main, back);
        },
        onStateChange: () => {
          if (!this._isFeedOpen()) return;
          this._syncAmbilightWithMain();
        },
        onError: () => {
          this._destroyAmbilightPlayer();
        },
      },
    });
  }

  /**
   * @param {object[]} items
   * @param {number} startIndex
   */
  async open(items, startIndex = 0) {
    if (!this._root || !this._trackEl || !this._scrollEl) return;
    this.items = [...items];
    this.activeIndex = Math.max(0, Math.min(startIndex, this.items.length - 1));
    this._userPaused = false;
    this._loadedVideoId = null;
    this._renderSlides();
    this._root.hidden = false;
    document.body.classList.add('shorts-feed-open');
    window.addEventListener('resize', this._onResize);
    this._setupObserver();
    await loadYoutubeIframeAPI();
    await this._ensurePlayer();
    this._updateAmbilightMode();
    requestAnimationFrame(() => {
      if (!this._isFeedOpen()) return;
      this._scrollToIndex(this.activeIndex, 'instant');
      requestAnimationFrame(() => {
        if (!this._isFeedOpen()) return;
        void this._activateIndex(this.activeIndex, { force: true });
      });
    });
  }

  close() {
    if (!this._root || this._root.hidden) return;
    this._userPaused = true;
    ++this._activateToken;
    this._root.hidden = true;
    this._root.classList.remove('shorts-feed--ambilight');
    document.body.classList.remove('shorts-feed-open');
    window.removeEventListener('resize', this._onResize);
    this._observer?.disconnect();
    this._observer = null;
    this._playerLayer?.classList.remove('is-visible');
    this._destroyPlayers();
    if (this._trackEl) this._trackEl.innerHTML = '';
    this.onClose?.();
  }

  /**
   * @param {object[]} newItems
   */
  appendItems(newItems) {
    if (!this._isFeedOpen()) return;
    const fresh = newItems.filter(
      (i) => i?.id && !this.items.some((x) => x.id === i.id)
    );
    if (fresh.length === 0) return;
    this.items.push(...fresh);
    this._appendSlides(fresh, this.items.length - fresh.length);
    this._observeSlides();
  }

  _renderSlides() {
    if (!this._trackEl) return;
    this._trackEl.innerHTML = '';
    this._appendSlides(this.items, 0);
  }

  /**
   * @param {object[]} slice
   * @param {number} startIdx
   */
  _appendSlides(slice, startIdx) {
    if (!this._trackEl) return;
    slice.forEach((item, offset) => {
      const index = startIdx + offset;
      const slide = createElement('section', {
        className: 'shorts-feed-slide',
        'data-index': String(index),
      });

      const frame = createElement('div', { className: 'shorts-feed-frame' });
      const slot = createElement('div', {
        className: 'shorts-feed-player-slot',
        'data-index': String(index),
      });

      if (item.thumbnail) {
        const poster = createElement('img', {
          className: 'shorts-feed-poster',
          src: item.thumbnail,
          alt: '',
          loading: 'lazy',
          'data-index': String(index),
        });
        frame.appendChild(poster);
      }

      frame.appendChild(slot);

      const meta = createElement('div', { className: 'shorts-feed-meta' });
      meta.appendChild(
        createElement(
          'h2',
          { className: 'shorts-feed-title' },
          escapeHtml(item.title || 'Sans titre')
        )
      );
      const channel =
        item.channel && String(item.channel).trim() && item.channel !== '—'
          ? String(item.channel).trim()
          : '';
      if (channel) {
        meta.appendChild(
          createElement(
            'p',
            { className: 'shorts-feed-channel' },
            escapeHtml(channel)
          )
        );
      }
      const dur =
        item.duration != null && item.duration > 0
          ? formatDuration(item.duration)
          : '';
      if (dur && dur !== '—') {
        meta.appendChild(
          createElement('p', { className: 'shorts-feed-duration' }, dur)
        );
      }

      const actions = createElement('div', {
        className: 'shorts-feed-actions',
      });
      const videoId = item.id || '';
      const isFav = videoId && this.favorites?.isFavorite(videoId);
      const favBtn = createElement('button', {
        type: 'button',
        className: `shorts-feed-action-btn${isFav ? ' is-active' : ''}`,
        title: isFav ? 'Retirer des favoris' : 'Favori',
        'aria-label': isFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
      });
      favBtn.textContent = '★';
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onFavorite?.(item);
        if (this.favorites && videoId) {
          const added = this.favorites.toggle(item);
          favBtn.classList.toggle('is-active', added);
        }
      });

      const dlBtn = createElement('button', {
        type: 'button',
        className: 'shorts-feed-action-btn',
        title: 'Télécharger',
        'aria-label': 'Télécharger',
      });
      dlBtn.textContent = '↓';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDownload?.(item);
      });

      const shareBtn = createElement('button', {
        type: 'button',
        className: 'shorts-feed-action-btn',
        title: 'Partager',
        'aria-label': 'Partager',
      });
      shareBtn.textContent = '⧉';
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onShare?.(item);
      });

      actions.appendChild(favBtn);
      actions.appendChild(dlBtn);
      actions.appendChild(shareBtn);

      slide.appendChild(frame);
      slide.appendChild(meta);
      slide.appendChild(actions);
      this._trackEl.appendChild(slide);
    });
  }

  _setupObserver() {
    this._observer?.disconnect();
    this._observer = new IntersectionObserver(
      (entries) => {
        if (!this._isFeedOpen()) return;
        let best = null;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            best = entry;
          }
        }
        if (!best || bestRatio < 0.6) return;
        const slide = best.target;
        const idx = Number(slide.getAttribute('data-index'));
        if (!Number.isFinite(idx)) return;
        void this._activateIndex(idx);
      },
      {
        root: this._scrollEl,
        threshold: [0.6, 0.75, 0.9],
      }
    );
    this._observeSlides();
  }

  _observeSlides() {
    if (!this._observer || !this._trackEl) return;
    this._trackEl
      .querySelectorAll('.shorts-feed-slide:not([data-observed])')
      .forEach((el) => {
        el.setAttribute('data-observed', '1');
        this._observer.observe(el);
      });
  }

  /**
   * @param {number} index
   * @param {'smooth' | 'instant'} [behavior]
   */
  _scrollToIndex(index, behavior = 'smooth') {
    if (!this._scrollEl || !this._isFeedOpen()) return;
    const clamped = Math.max(0, Math.min(index, this.items.length - 1));
    const top = clamped * this._scrollEl.clientHeight;
    this._scrollEl.scrollTo({
      top,
      behavior: behavior === 'instant' ? 'instant' : 'smooth',
    });
  }

  /** @param {number} index */
  _getFrameEl(index) {
    return this._trackEl?.querySelector(
      `.shorts-feed-slide[data-index="${index}"] .shorts-feed-frame`
    );
  }

  /** @param {number} index */
  _setPosterVisible(index, visible) {
    const poster = this._trackEl?.querySelector(
      `.shorts-feed-poster[data-index="${index}"]`
    );
    if (poster) poster.classList.toggle('is-hidden', !visible);
  }

  _syncPlayerPosition() {
    if (!this._playerLayer || !this._isFeedOpen()) return;
    const frame = this._getFrameEl(this.activeIndex);
    if (!frame) {
      this._playerLayer.classList.remove('is-visible');
      return;
    }
    const rect = frame.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    this._playerLayer.style.left = `${Math.round(rect.left)}px`;
    this._playerLayer.style.top = `${Math.round(rect.top)}px`;
    this._playerLayer.style.width = `${w}px`;
    this._playerLayer.style.height = `${h}px`;
    this._playerLayer.classList.add('is-visible');

    if (this._player?.setSize && this._playerReady) {
      try {
        this._player.setSize(w, h);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {number} index
   * @param {{ force?: boolean }} [opts]
   */
  async _activateIndex(index, opts = {}) {
    if (!this._isFeedOpen()) return;
    if (index < 0 || index >= this.items.length) return;

    const item = this.items[index];
    const videoId = item?.id;
    if (!videoId) return;

    const same =
      this.activeIndex === index && this._loadedVideoId === videoId;
    if (same && !opts.force) return;

    const prevIndex = this.activeIndex;
    this.activeIndex = index;
    this._userPaused = false;
    const token = ++this._activateToken;

    if (prevIndex !== index) {
      this._setPosterVisible(prevIndex, true);
    }
    this._setPosterVisible(index, true);

    this._syncPlayerPosition();
    await this._ensurePlayer();
    if (!this._isFeedOpen() || token !== this._activateToken) return;

    if (this._player && this._playerReady) {
      if (this._loadedVideoId !== videoId) {
        this._loadedVideoId = videoId;
        try {
          this._player.loadVideoById({ videoId, startSeconds: 0 });
        } catch {
          this._player.loadVideoById(videoId);
        }
        if (this._shouldUseAmbilight()) {
          if (
            this._ambilightPlayer &&
            this._ambilightReady &&
            this._ambilightVideoId !== videoId
          ) {
            this._ambilightVideoId = videoId;
            this._ambilightPlayer.loadVideoById(videoId);
          } else {
            void this._attachAmbilightPlayer(videoId);
          }
        }
      } else if (opts.force) {
        try {
          this._player.seekTo(0, true);
        } catch {
          /* ignore */
        }
      }
      try {
        this._player.playVideo?.();
      } catch {
        /* ignore */
      }
      this._syncAmbilightWithMain();
      this._syncPlayerPosition();
    } else {
      this._pendingVideoId = videoId;
    }

    this._maybeLoadMore();
    this.onItemActive?.(item);
  }

  _onMainPlayerStateChange(e) {
    if (!this._isFeedOpen() || !this._player) return;
    const Y = window.YT;
    if (!Y?.PlayerState) return;

    if (
      e.data === Y.PlayerState.PLAYING ||
      e.data === Y.PlayerState.BUFFERING
    ) {
      this._userPaused = false;
      this._setPosterVisible(this.activeIndex, false);
      this._syncPlayerPosition();
    }

    if (e.data === Y.PlayerState.PAUSED) {
      this._userPaused = true;
      this._setPosterVisible(this.activeIndex, true);
    }

    if (e.data === Y.PlayerState.ENDED) {
      this._userPaused = false;
      this._scrollToIndex(this.activeIndex + 1);
    }

    if (e.data === Y.PlayerState.CUED && !this._userPaused) {
      try {
        this._player.playVideo?.();
      } catch {
        /* ignore */
      }
    }

    this._syncAmbilightWithMain();
  }

  async _ensurePlayer() {
    if (!this._playerHost || !this._isFeedOpen()) return;
    if (this._player && this._playerReady) return;

    await loadYoutubeIframeAPI();
    if (!this._isFeedOpen() || !this._playerHost.isConnected) return;

    const hostId = this._playerHost.id;
    if (!hostId || this._player) return;

    this._playerReady = false;
    const initialId =
      this._pendingVideoId || this.items[this.activeIndex]?.id || null;
    const rect = this._getFrameEl(this.activeIndex)?.getBoundingClientRect();
    const w = rect && rect.width > 0 ? Math.round(rect.width) : 360;
    const h = rect && rect.height > 0 ? Math.round(rect.height) : 640;

    this._player = new window.YT.Player(hostId, {
      videoId: initialId || undefined,
      width: w,
      height: h,
      playerVars: {
        ...mainYoutubePlayerVars(),
        controls: 0,
        rel: 0,
        autoplay: 1,
      },
      events: {
        onReady: () => {
          if (!this._isFeedOpen()) return;
          this._playerReady = true;
          const id =
            this._pendingVideoId || this.items[this.activeIndex]?.id;
          if (id) {
            this._loadedVideoId = id;
            this._syncPlayerPosition();
            this._player?.playVideo?.();
            if (this._shouldUseAmbilight()) {
              void this._attachAmbilightPlayer(id);
            }
          }
        },
        onStateChange: (e) => this._onMainPlayerStateChange(e),
      },
    });
  }

  async _maybeLoadMore() {
    if (!this._isFeedOpen()) return;
    if (this._loadingMore || !this.onNeedMore) return;
    if (this.items.length === 0) return;
    if (this.activeIndex < this.items.length - 3) return;

    this._loadingMore = true;
    try {
      const more = await this.onNeedMore();
      if (!this._isFeedOpen()) return;
      if (Array.isArray(more) && more.length > 0) {
        this.appendItems(more);
      }
    } catch {
      /* ignore */
    } finally {
      this._loadingMore = false;
    }
  }
}
