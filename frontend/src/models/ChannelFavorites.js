const STORAGE_KEY = 'yt-channel-favorites';
const MAX_ENTRIES = 30;

/**
 * Favoris chaînes YouTube (localStorage), dédoublonné par channelId / URL / nom.
 */
export class ChannelFavorites {
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
   * @param {object} item
   * @returns {string | null}
   */
  entryKey(item) {
    const id =
      typeof item?.channelId === 'string' ? item.channelId.trim() : '';
    if (id && /^UC[\w-]{20,}$/i.test(id)) return `id:${id}`;

    const url =
      typeof item?.channelUrl === 'string' ? item.channelUrl.trim() : '';
    if (url && url.includes('youtube.com')) return `url:${url}`;

    const name = this.#normalizeName(
      item?.channelName ?? item?.channel ?? ''
    );
    return name ? `name:${name}` : null;
  }

  /**
   * @param {object} item
   * @returns {boolean}
   */
  isFavorite(item) {
    const key = this.entryKey(item);
    if (!key) return false;
    return this.#entries.some((e) => e.key === key);
  }

  /**
   * @param {object} item — channelId, channelUrl, channelName (ou channel)
   * @returns {boolean} true si ajouté, false si retiré
   */
  toggle(item) {
    const key = this.entryKey(item);
    if (!key) return false;

    const idx = this.#entries.findIndex((e) => e.key === key);
    if (idx >= 0) {
      this.#entries.splice(idx, 1);
      this.#save();
      this.#onChange?.();
      return false;
    }

    const channelName =
      typeof item?.channelName === 'string' && item.channelName.trim()
        ? item.channelName.trim()
        : typeof item?.channel === 'string' && item.channel.trim()
          ? item.channel.trim()
          : 'Chaîne';

    this.#entries.unshift({
      key,
      channelId:
        typeof item?.channelId === 'string' && item.channelId.trim()
          ? item.channelId.trim()
          : null,
      channelUrl:
        typeof item?.channelUrl === 'string' && item.channelUrl.trim()
          ? item.channelUrl.trim()
          : null,
      channelName,
      thumbnail:
        typeof item?.thumbnail === 'string' && item.thumbnail.startsWith('http')
          ? item.thumbnail
          : null,
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

  /**
   * @param {string} key — clé d’entrée (`entry.key`)
   * @returns {boolean}
   */
  remove(key) {
    const k = typeof key === 'string' ? key.trim() : '';
    if (!k) return false;
    const idx = this.#entries.findIndex((e) => e.key === k);
    if (idx < 0) return false;
    this.#entries.splice(idx, 1);
    this.#save();
    this.#onChange?.();
    return true;
  }

  clear() {
    this.#entries = [];
    this.#save();
    this.#onChange?.();
  }

  #normalizeName(name) {
    if (typeof name !== 'string') return '';
    const t = name.trim();
    if (!t || t === '—') return '';
    return t.toLowerCase();
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
        (e) =>
          e && typeof e.key === 'string' && typeof e.channelName === 'string'
      );
    } catch {
      this.#entries = [];
    }
  }
}
