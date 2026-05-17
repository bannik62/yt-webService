import { createElement } from '../utils/dom.js';
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
 * @returns {{ lines: string[], summary: string | null, isEmpty: boolean }}
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
 * Modal pour afficher vidéo YouTube et ajouter à la liste
 */
export class VideoModal {
  /**
   * @param {import('../api/ApiClient.js').ApiClient | null} [api]
   */
  constructor(api = null) {
    this.api = api;
    this.modal = null;
    this.currentItem = null;
    this.playlist = null;
    this.currentIndex = 0;
    this.onAdd = null;
    this.onNext = null;
    this.onPrevious = null;
    this._ytPlayer = null;
    /** @type {number} */
    this._metaLoadGen = 0;
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
    this.render();
  }

  close() {
    this._metaLoadGen += 1;
    this._destroyYtPlayer();
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

  _destroyYtPlayer() {
    if (this._ytPlayer) {
      try {
        this._ytPlayer.destroy();
      } catch {
        /* ignore */
      }
      this._ytPlayer = null;
    }
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
      return;
    }

    if (state === 'error') {
      metaEl.classList.add('is-error');
      metaEl.textContent = opts.message || 'Infos indisponibles';
      return;
    }

    if (state === 'empty') {
      metaEl.classList.add('is-empty');
      metaEl.textContent = 'Aucune info complémentaire';
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
  }

  /**
   * @param {HTMLElement} metaEl
   * @param {string} summaryText
   */
  _appendExpandableSummary(metaEl, summaryText) {
    const text = String(summaryText).trim();
    if (!text) return;

    const wrap = createElement('div', { className: 'modal-video-meta-summary-wrap' });
    const p = createElement('p', { className: 'modal-video-meta-summary' });
    p.textContent = text;
    wrap.appendChild(p);

    const needsToggle = text.length > 180 || text.includes('\n');
    if (!needsToggle) {
      wrap.classList.add('is-expanded');
      metaEl.appendChild(wrap);
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
      const expanded = wrap.classList.toggle('is-expanded');
      btn.textContent = expanded ? 'Voir moins' : 'Voir plus';
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
    wrap.appendChild(btn);
    metaEl.appendChild(wrap);
  }

  /**
   * @param {HTMLElement} metaEl
   * @param {string} videoId
   * @param {object} item
   * @param {number} loadGen
   */
  async _loadVideoMeta(metaEl, videoId, item, loadGen) {
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

    if (initial.isEmpty) {
      this._setMetaPanel(metaEl, 'loading');
    }

    const meta = await this.api.fetchVideoMeta(videoId);
    if (loadGen !== this._metaLoadGen || !this.modal?.contains(metaEl)) {
      return;
    }

    if (meta?.error && meta.available === false && !meta.uploadedAt && !meta.viewCount) {
      if (initial.isEmpty) {
        this._setMetaPanel(metaEl, 'error', { message: meta.error });
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

  render() {
    this._destroyYtPlayer();
    this._metaLoadGen += 1;
    const loadGen = this._metaLoadGen;

    if (this.modal) {
      this.modal.remove();
    }

    const item = this.currentItem;
    const videoId = resolveVideoId(item?.url, item);
    if (!videoId) {
      alert('URL YouTube invalide');
      return;
    }

    const overlay = createElement('div', {
      className: 'modal-overlay',
      onClick: () => this.close(),
    });

    const modalContent = createElement('div', {
      className: 'modal-content',
      onClick: (e) => e.stopPropagation(),
    });

    const header = createElement('div', { className: 'modal-header' });
    header.appendChild(
      createElement('h2', { className: 'modal-title' }, escapeHtml(item.title || 'Vidéo'))
    );
    header.appendChild(
      createElement(
        'button',
        {
          className: 'modal-close',
          type: 'button',
          onClick: () => this.close(),
        },
        '×'
      )
    );

    const body = createElement('div', { className: 'modal-body' });
    const iframeContainer = createElement('div', {
      className: 'video-container',
    });
    const hasPlaylistNav = this.playlist && this.playlist.length > 1;

    if (hasPlaylistNav) {
      const hostId = `modal-yt-player-${Date.now()}`;
      const host = createElement('div', {
        id: hostId,
        className: 'video-container-host',
      });
      iframeContainer.appendChild(host);
      body.appendChild(iframeContainer);

      loadYoutubeIframeAPI().then(() => {
        if (!this.modal || !document.getElementById(hostId)) return;

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
            onStateChange: (e) => {
              if (e.data !== window.YT.PlayerState.ENDED) return;
              if (
                this.playlist &&
                this.currentIndex < this.playlist.length - 1
              ) {
                this.showNext();
              }
            },
          },
        });
      });
    } else {
      const iframe = createElement('iframe', {
        src: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
        frameborder: '0',
        allow: 'autoplay; encrypted-media; fullscreen',
        allowfullscreen: true,
      });
      iframeContainer.appendChild(iframe);
      body.appendChild(iframeContainer);
    }

    const footer = createElement('div', { className: 'modal-footer' });
    const footerMain = createElement('div', {
      className: 'modal-footer-main',
    });

    if (hasPlaylistNav) {
      const nav = createElement('div', { className: 'modal-nav' });
      nav.appendChild(
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
      nav.appendChild(
        createElement(
          'span',
          { className: 'modal-counter' },
          `${this.currentIndex + 1} / ${this.playlist.length}`
        )
      );
      nav.appendChild(
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
      footerMain.appendChild(nav);
    } else {
      footerMain.appendChild(
        createElement(
          'button',
          {
            className: 'btn btn-primary btn-large',
            type: 'button',
            onClick: () => {
              if (this.onAdd) {
                this.onAdd(this.currentItem);
              }
              this.close();
            },
          },
          '➕ Ajouter à ma liste'
        )
      );
    }

    const metaEl = createElement('div', {
      className: 'modal-video-meta',
      'aria-live': 'polite',
    });

    footer.appendChild(footerMain);
    footer.appendChild(metaEl);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    overlay.appendChild(modalContent);

    document.body.appendChild(overlay);
    this.modal = overlay;

    void this._loadVideoMeta(metaEl, videoId, item, loadGen);

    setTimeout(() => overlay.classList.add('show'), 10);

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  showNext() {
    if (!this.playlist || this.currentIndex >= this.playlist.length - 1) return;
    this.currentIndex++;
    this.currentItem = this.playlist[this.currentIndex];
    this.render();
    if (this.onNext) this.onNext(this.currentIndex);
  }

  showPrevious() {
    if (!this.playlist || this.currentIndex <= 0) return;
    this.currentIndex--;
    this.currentItem = this.playlist[this.currentIndex];
    this.render();
    if (this.onPrevious) this.onPrevious(this.currentIndex);
  }
}
