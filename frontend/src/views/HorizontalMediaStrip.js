import { createElement } from '../utils/dom.js';
import { channelLabelFromItem } from '../utils/channelLabel.js';
import { formatPlayedAt } from '../utils/formatters.js';

/**
 * Bandeau horizontal de vignettes (favoris, historique) — carrousel sans scrollbar.
 */
export class HorizontalMediaStrip {
  /**
   * @param {{
   *   sectionEl: HTMLElement | null,
   *   trackEl: HTMLElement | null,
   *   viewportEl?: HTMLElement | null,
   *   prevBtn?: HTMLElement | null,
   *   nextBtn?: HTMLElement | null,
   *   emptyEl?: HTMLElement | null,
   *   clearBtn?: HTMLElement | null,
   *   onPlay: (item: object) => void,
   *   onChannelClick?: (entry: object) => void,
   *   onClear?: () => void,
   *   onRemove?: (entry: object) => void,
   *   showWhenEmpty?: boolean,
   *   showPlayedAt?: boolean,
   * }} config
   */
  constructor(config) {
    this.sectionEl = config.sectionEl;
    this.trackEl = config.trackEl;
    this.viewportEl = config.viewportEl ?? null;
    this.prevBtn = config.prevBtn ?? null;
    this.nextBtn = config.nextBtn ?? null;
    this.emptyEl = config.emptyEl ?? null;
    this.clearBtn = config.clearBtn ?? null;
    this.onPlay = config.onPlay;
    this.onChannelClick = config.onChannelClick;
    this.onClear = config.onClear;
    this.onRemove = config.onRemove;
    this.showWhenEmpty = config.showWhenEmpty ?? false;
    this.showPlayedAt = config.showPlayedAt ?? false;

    /** @type {boolean} */
    this._suppressClick = false;
    /** @type {boolean} */
    this._carouselBound = false;

    this.clearBtn?.addEventListener('click', () => {
      if (!this.onClear) return;
      this.onClear();
    });

    this.#bindCarousel();
  }

  /**
   * @param {object[]} entries
   */
  render(entries) {
    if (!this.trackEl) return;

    const list = Array.isArray(entries) ? entries : [];
    const hasItems = list.length > 0;

    if (this.sectionEl) {
      this.sectionEl.hidden = !hasItems && !this.showWhenEmpty;
    }
    if (this.clearBtn) {
      this.clearBtn.hidden = !hasItems;
    }
    if (this.emptyEl) {
      this.emptyEl.hidden = hasItems;
    }

    this.trackEl.innerHTML = '';
    if (!hasItems) {
      this.#updateNavState();
      return;
    }

    for (const entry of list) {
      const videoId = entry.videoId || entry.id;
      const title = entry.title || 'Sans titre';
      const channelName = channelLabelFromItem(entry);
      const thumb = this.#thumbnailUrl(videoId, entry.thumbnail);

      const card = createElement('button', {
        type: 'button',
        className: 'media-strip-card',
        title,
      });

      const thumbWrapEl = createElement('div', {
        className: [
          'media-strip-card-thumb',
          this.showPlayedAt && entry.playedAt ? 'has-played-at' : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
      if (thumb) {
        thumbWrapEl.appendChild(
          createElement('img', {
            src: thumb,
            alt: '',
            className: 'media-strip-card-img',
            loading: 'lazy',
            draggable: 'false',
          })
        );
      }

      if (this.onRemove && videoId) {
        const removeBtn = createElement('button', {
          type: 'button',
          className: 'media-strip-remove-btn',
          title: 'Retirer',
          'aria-label': 'Retirer',
        });
        removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-12"/></svg>`;
        removeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.onRemove?.(entry);
        });
        thumbWrapEl.appendChild(removeBtn);
      }

      const grad = createElement('div', { className: 'media-strip-card-overlay' });
      const titleEl = createElement('span', { className: 'media-strip-card-title' });
      titleEl.textContent = title;
      grad.appendChild(titleEl);

      if (this.showPlayedAt && entry.playedAt) {
        const sub = createElement('span', { className: 'media-strip-card-sub' });
        sub.textContent = formatPlayedAt(entry.playedAt);
        grad.appendChild(sub);
      }

      thumbWrapEl.appendChild(grad);
      card.appendChild(thumbWrapEl);

      if (channelName && this.onChannelClick) {
        const channelBadge = createElement('button', {
          type: 'button',
          className: 'media-strip-channel-badge',
          title: `Voir les vidéos de ${channelName}`,
          'aria-label': `Rechercher les vidéos de ${channelName}`,
        });
        channelBadge.textContent = channelName;
        channelBadge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.onChannelClick?.(entry);
        });
        card.appendChild(channelBadge);
      } else if (channelName) {
        const channelBadge = createElement('span', {
          className: 'media-strip-channel-badge media-strip-channel-badge--label',
          title: channelName,
        });
        channelBadge.textContent = channelName;
        card.appendChild(channelBadge);
      }

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._suppressClick) {
          this._suppressClick = false;
          return;
        }
        this.onPlay?.({
          id: videoId,
          videoId,
          url:
            entry.url ||
            (videoId
              ? `https://www.youtube.com/watch?v=${videoId}`
              : ''),
          title,
          channel: channelName || entry.channel,
          channelName: channelName || entry.channelName || entry.channel,
          channelId: entry.channelId || entry.channel_id || '',
          duration: entry.duration,
          thumbnail: thumb,
        });
      });

      this.trackEl.appendChild(card);
    }

    if (this.viewportEl) {
      this.viewportEl.scrollLeft = 0;
    }
    requestAnimationFrame(() => this.#updateNavState());
  }

  #thumbnailUrl(videoId, entryThumb) {
    if (entryThumb && typeof entryThumb === 'string') return entryThumb;
    if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    return '';
  }

  #bindCarousel() {
    if (!this.viewportEl || this._carouselBound) return;
    this._carouselBound = true;

    this.prevBtn?.addEventListener('click', () => this.#scrollByPage(-1));
    this.nextBtn?.addEventListener('click', () => this.#scrollByPage(1));

    this.viewportEl.addEventListener('scroll', () => this.#updateNavState(), {
      passive: true,
    });

    let pointerId = null;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;

    this.viewportEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // Ne pas capturer le pointeur sur une carte : laisser le clic ouvrir la vidéo
      if (e.target.closest('.media-strip-card')) return;

      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = this.viewportEl.scrollLeft;
      dragged = false;
      this.viewportEl.classList.add('is-dragging');
      this.viewportEl.setPointerCapture(e.pointerId);
    });

    this.viewportEl.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) dragged = true;
      this.viewportEl.scrollLeft = startScroll - dx;
    });

    const endDrag = (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      this.viewportEl.classList.remove('is-dragging');
      try {
        this.viewportEl.releasePointerCapture(e.pointerId);
      } catch {
        /* déjà relâché */
      }
      if (dragged) {
        this._suppressClick = true;
        this.#applyScrollSnap();
      }
      this.#updateNavState();
    };

    this.viewportEl.addEventListener('pointerup', endDrag);
    this.viewportEl.addEventListener('pointercancel', endDrag);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.#updateNavState());
      ro.observe(this.viewportEl);
    }
  }

  #scrollStep() {
    const card = this.trackEl?.querySelector('.media-strip-card');
    if (!card || !this.trackEl) return this.viewportEl?.clientWidth ?? 320;
    const gap = Number.parseFloat(getComputedStyle(this.trackEl).gap) || 12;
    return (card.offsetWidth + gap) * 2;
  }

  #scrollByPage(direction) {
    const viewport = this.viewportEl;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * this.#scrollStep(),
      behavior: 'smooth',
    });
  }

  #applyScrollSnap() {
    const viewport = this.viewportEl;
    const card = this.trackEl?.querySelector('.media-strip-card');
    if (!viewport || !card) return;

    const gap = Number.parseFloat(getComputedStyle(this.trackEl).gap) || 12;
    const step = card.offsetWidth + gap;
    const index = Math.round(viewport.scrollLeft / step);
    viewport.scrollTo({ left: index * step, behavior: 'smooth' });
  }

  #updateNavState() {
    const viewport = this.viewportEl;
    if (!viewport || !this.prevBtn || !this.nextBtn) return;

    const max = viewport.scrollWidth - viewport.clientWidth;
    const left = viewport.scrollLeft;
    const eps = 6;
    const canScroll = max > eps;

    this.prevBtn.hidden = !canScroll;
    this.nextBtn.hidden = !canScroll;
    this.prevBtn.disabled = left <= eps;
    this.nextBtn.disabled = left >= max - eps;
  }
}
