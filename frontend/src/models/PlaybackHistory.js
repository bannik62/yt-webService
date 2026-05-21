import { channelLabelFromItem, validChannelLabel } from '../utils/channelLabel.js';

const STORAGE_KEY = 'yt-playback-history';
const MAX_ENTRIES = 150;

/**
 * Historique des lectures (localStorage), dédoublonné par vidéo YouTube.
 */
export class PlaybackHistory {
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
   * @param {object} item — carte recherche / liste (id = videoId YouTube)
   */
  record(item) {
    const videoId = this.#videoIdFromItem(item);
    if (!videoId) return;

    this.#entries = this.#entries.filter((e) => e.videoId !== videoId);
    const channel = channelLabelFromItem(item) || '—';
    this.#entries.unshift({
      videoId,
      url: item.url || `https://www.youtube.com/watch?v=${videoId}`,
      title: item.title || 'Sans titre',
      channel,
      channelName: channel !== '—' ? channel : undefined,
      duration: item.duration ?? null,
      thumbnail: item.thumbnail ?? null,
      playedAt: new Date().toISOString(),
    });

    if (this.#entries.length > MAX_ENTRIES) {
      this.#entries.length = MAX_ENTRIES;
    }

    this.#save();
    this.#onChange?.();
  }

  /** @returns {object[]} plus récent en premier */
  getAll() {
    return [...this.#entries];
  }

  /**
   * @param {string} videoId
   * @returns {boolean}
   */
  remove(videoId) {
    const id = typeof videoId === 'string' ? videoId.trim() : '';
    if (!id) return false;
    const idx = this.#entries.findIndex((e) => e.videoId === id);
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

  /**
   * @param {string} videoId
   * @param {string} channel
   * @returns {boolean}
   */
  patchChannel(videoId, channel) {
    const id = typeof videoId === 'string' ? videoId.trim() : '';
    const label = validChannelLabel(channel);
    if (!id || !label) return false;
    const idx = this.#entries.findIndex((e) => e.videoId === id);
    if (idx < 0) return false;
    if (validChannelLabel(this.#entries[idx].channel) === label) return false;
    this.#entries[idx] = {
      ...this.#entries[idx],
      channel: label,
      channelName: label,
    };
    this.#save();
    this.#onChange?.();
    return true;
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
        (e) => e && typeof e.videoId === 'string' && typeof e.playedAt === 'string'
      );
    } catch {
      this.#entries = [];
    }
  }
}
