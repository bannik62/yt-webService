const STORAGE_KEY = 'yt-favorites';
const MAX_ENTRIES = 80;

/**
 * Favoris (localStorage), dédoublonné par vidéo YouTube.
 */
export class Favorites {
  /** @type {Array<object>} */
  #entries = [];
  /** @type {(() => void) | null} */
  #onChange = null;

  constructor() {
    this.#load();
  }

  onChange(fn) {
    this.#onChange = fn;
  }

  /**
   * @param {string} videoId
   * @returns {boolean}
   */
  isFavorite(videoId) {
    const id = typeof videoId === 'string' ? videoId.trim() : '';
    if (!id) return false;
    return this.#entries.some((e) => e.videoId === id);
  }

  /**
   * @param {object} item
   * @returns {boolean} true si ajouté, false si retiré
   */
  toggle(item) {
    const videoId = this.#videoIdFromItem(item);
    if (!videoId) return false;

    const idx = this.#entries.findIndex((e) => e.videoId === videoId);
    if (idx >= 0) {
      this.#entries.splice(idx, 1);
      this.#save();
      this.#onChange?.();
      return false;
    }

    this.#entries.unshift({
      videoId,
      url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
      title: item.title || 'Sans titre',
      channel: item.channel ?? '—',
      duration: item.duration ?? null,
      thumbnail: item.thumbnail ?? this.#defaultThumb(videoId),
      addedAt: new Date().toISOString(),
    });

    if (this.#entries.length > MAX_ENTRIES) {
      this.#entries.length = MAX_ENTRIES;
    }

    this.#save();
    this.#onChange?.();
    return true;
  }

  /** @returns {object[]} */
  getAll() {
    return [...this.#entries];
  }

  clear() {
    this.#entries = [];
    this.#save();
    this.#onChange?.();
  }

  /**
   * @param {object} item
   * @returns {object | null}
   */
  toEntry(item) {
    const videoId = this.#videoIdFromItem(item);
    if (!videoId) return null;
    return {
      videoId,
      id: videoId,
      url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
      title: item.title || 'Sans titre',
      channel: item.channel ?? '—',
      duration: item.duration ?? null,
      thumbnail: item.thumbnail ?? this.#defaultThumb(videoId),
    };
  }

  #defaultThumb(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  }

  #videoIdFromItem(item) {
    if (item?.videoId && /^[a-zA-Z0-9_-]{11}$/.test(String(item.videoId))) {
      return String(item.videoId);
    }
    if (item?.id && /^[a-zA-Z0-9_-]{11}$/.test(String(item.id))) {
      return String(item.id);
    }
    const url = item?.url;
    if (typeof url !== 'string') return null;
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  #save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#entries));
    } catch {
      /* quota */
    }
  }

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.#entries = parsed.filter(
        (e) => e && typeof e.videoId === 'string'
      );
    } catch {
      this.#entries = [];
    }
  }
}
