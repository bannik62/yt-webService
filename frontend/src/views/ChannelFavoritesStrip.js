import { createElement } from '../utils/dom.js';

/**
 * Bandeau horizontal de badges chaîne (favoris créateur).
 */
export class ChannelFavoritesStrip {
  /**
   * @param {{
   *   sectionEl: HTMLElement | null,
   *   trackEl: HTMLElement | null,
   *   viewportEl?: HTMLElement | null,
   *   prevBtn?: HTMLElement | null,
   *   nextBtn?: HTMLElement | null,
   *   clearBtn?: HTMLElement | null,
   *   emptyEl?: HTMLElement | null,
   *   onSelect: (channel: object) => void,
   *   onClear?: () => void,
   * }} config
   */
  constructor(config) {
    this.sectionEl = config.sectionEl;
    this.trackEl = config.trackEl;
    this.viewportEl = config.viewportEl ?? null;
    this.prevBtn = config.prevBtn ?? null;
    this.nextBtn = config.nextBtn ?? null;
    this.clearBtn = config.clearBtn ?? null;
    this.emptyEl = config.emptyEl ?? null;
    this.onSelect = config.onSelect;
    this.onClear = config.onClear;

    /** @type {boolean} */
    this._carouselBound = false;

    this.clearBtn?.addEventListener('click', () => {
      this.onClear?.();
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
      this.sectionEl.hidden = !hasItems;
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
      const name = entry.channelName || 'Chaîne';
      const badge = createElement('button', {
        type: 'button',
        className: 'channel-favorite-badge',
        title: `Voir les vidéos de ${name}`,
      });
      badge.textContent = name;
      badge.addEventListener('click', () => {
        this.onSelect?.({
          channelId: entry.channelId ?? undefined,
          channelUrl: entry.channelUrl ?? undefined,
          channel: entry.channelName,
          channelName: entry.channelName,
        });
      });
      this.trackEl.appendChild(badge);
    }

    if (this.viewportEl) {
      this.viewportEl.scrollLeft = 0;
    }
    requestAnimationFrame(() => this.#updateNavState());
  }

  #bindCarousel() {
    if (!this.viewportEl || this._carouselBound) return;
    this._carouselBound = true;

    this.prevBtn?.addEventListener('click', () => this.#scrollByPage(-1));
    this.nextBtn?.addEventListener('click', () => this.#scrollByPage(1));
    this.viewportEl.addEventListener('scroll', () => this.#updateNavState(), {
      passive: true,
    });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.#updateNavState());
      ro.observe(this.viewportEl);
    }
  }

  #scrollStep() {
    const badge = this.trackEl?.querySelector('.channel-favorite-badge');
    if (!badge || !this.trackEl) return this.viewportEl?.clientWidth ?? 320;
    const gap = Number.parseFloat(getComputedStyle(this.trackEl).gap) || 8;
    return (badge.offsetWidth + gap) * 3;
  }

  #scrollByPage(direction) {
    const viewport = this.viewportEl;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * this.#scrollStep(),
      behavior: 'smooth',
    });
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
