import { createElement } from '../utils/dom.js';
import { loadYoutubeIframeAPI } from '../utils/youtubeIframeApi.js';
import { mainYoutubePlayerVars } from '../utils/youtubeDualAmbilight.js';
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
    this._scrollEl = null;
    /** @type {HTMLElement | null} */
    this._trackEl = null;
    /** @type {HTMLElement | null} */
    this._root = null;
    this._activateToken = 0;
    this._onResize = () => this._syncPlayerPosition();

    this._buildShell();
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

    this._root.appendChild(this._scrollEl);
    this._root.appendChild(this._playerLayer);
    this._root.appendChild(closeBtn);
    document.body.appendChild(this._root);

    this._scrollEl.addEventListener(
      'scroll',
      () => {
        this._syncPlayerPosition();
        this._maybeLoadMore();
      },
      { passive: true }
    );

    this._bindMobileSwipe();

    document.addEventListener('keydown', this._onKeyDown);
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
    if (!this._root || this._root.hidden) return;
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

  /**
   * @param {object[]} items
   * @param {number} startIndex
   */
  async open(items, startIndex = 0) {
    if (!this._root || !this._trackEl || !this._scrollEl) return;
    this.items = [...items];
    this.activeIndex = Math.max(0, Math.min(startIndex, this.items.length - 1));
    this._loadedVideoId = null;
    this._renderSlides();
    this._root.hidden = false;
    document.body.classList.add('shorts-feed-open');
    window.addEventListener('resize', this._onResize);
    this._setupObserver();
    await loadYoutubeIframeAPI();
    await this._ensurePlayer();
    requestAnimationFrame(() => {
      this._scrollToIndex(this.activeIndex, 'instant');
      requestAnimationFrame(() => {
        void this._activateIndex(this.activeIndex, { force: true });
      });
    });
  }

  close() {
    if (!this._root) return;
    this._root.hidden = true;
    document.body.classList.remove('shorts-feed-open');
    window.removeEventListener('resize', this._onResize);
    this._observer?.disconnect();
    this._observer = null;
    this._playerLayer?.classList.remove('is-visible');
    if (this._player) {
      try {
        this._player.stopVideo?.();
      } catch {
        /* ignore */
      }
    }
    if (this._trackEl) this._trackEl.innerHTML = '';
    this._loadedVideoId = null;
    this.onClose?.();
  }

  /**
   * @param {object[]} newItems
   */
  appendItems(newItems) {
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
    if (!this._scrollEl) return;
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
    if (!this._playerLayer || this._root?.hidden) return;
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
    if (index < 0 || index >= this.items.length) return;

    const item = this.items[index];
    const videoId = item?.id;
    if (!videoId) return;

    const same =
      this.activeIndex === index && this._loadedVideoId === videoId;
    if (same && !opts.force) return;

    const prevIndex = this.activeIndex;
    this.activeIndex = index;
    const token = ++this._activateToken;

    if (prevIndex !== index) {
      this._setPosterVisible(prevIndex, true);
    }
    this._setPosterVisible(index, true);

    this._syncPlayerPosition();
    await this._ensurePlayer();
    if (token !== this._activateToken) return;

    if (this._player && this._playerReady) {
      if (this._loadedVideoId !== videoId) {
        this._loadedVideoId = videoId;
        try {
          this._player.loadVideoById({ videoId, startSeconds: 0 });
        } catch {
          this._player.loadVideoById(videoId);
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
      this._syncPlayerPosition();
    } else {
      this._pendingVideoId = videoId;
    }

    this._maybeLoadMore();
    this.onItemActive?.(item);
  }

  async _ensurePlayer() {
    if (!this._playerHost) return;
    if (this._player && this._playerReady) return;

    await loadYoutubeIframeAPI();
    if (!this._playerHost.isConnected) return;

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
        controls: window.innerWidth < 769 ? 0 : 1,
        rel: 0,
        autoplay: 1,
      },
      events: {
        onReady: () => {
          this._playerReady = true;
          const id =
            this._pendingVideoId || this.items[this.activeIndex]?.id;
          if (id) {
            this._loadedVideoId = id;
            this._syncPlayerPosition();
            this._player?.playVideo?.();
          }
        },
        onStateChange: (e) => {
          const Y = window.YT;
          if (!Y?.PlayerState || !this._player) return;

          if (
            e.data === Y.PlayerState.PLAYING ||
            e.data === Y.PlayerState.BUFFERING
          ) {
            this._setPosterVisible(this.activeIndex, false);
            this._syncPlayerPosition();
          }

          if (e.data === Y.PlayerState.ENDED) {
            this._scrollToIndex(this.activeIndex + 1);
          }

          if (e.data === Y.PlayerState.CUED) {
            try {
              this._player.playVideo?.();
            } catch {
              /* ignore */
            }
          }
        },
      },
    });
  }

  async _maybeLoadMore() {
    if (this._loadingMore || !this.onNeedMore) return;
    if (this.items.length === 0) return;
    if (this.activeIndex < this.items.length - 3) return;

    this._loadingMore = true;
    try {
      const more = await this.onNeedMore();
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
