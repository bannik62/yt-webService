/**
 * Gère la liste de téléchargement (panier)
 */
export class DownloadList {
  #items = [];
  #maxItems = 50;
  /** @type {Array<() => void>} */
  #onChangeListeners = [];

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Ajoute un item à la liste
   * @param {object} item
   * @returns {boolean} success
   */
  add(item) {
    if (this.#items.length >= this.#maxItems) return false;
    
    // Éviter les doublons
    if (this.#items.some(i => i.url === item.url)) return false;
    
    this.#items.push({
      id: crypto.randomUUID(),
      url: item.url,
      title: item.title,
      channel: item.channel,
      duration: item.duration,
      thumbnail: item.thumbnail
    });
    
    this.saveToStorage();
    this.#triggerChange();
    return true;
  }

  /**
   * Retire un item
   * @param {string} id
   */
  remove(id) {
    const index = this.#items.findIndex(i => i.id === id);
    if (index !== -1) {
      this.#items.splice(index, 1);
      this.saveToStorage();
      this.#triggerChange();
    }
  }

  /**
   * Réordonne un item (glisser-déposer)
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  reorder(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const n = this.#items.length;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= n || toIndex >= n) {
      return;
    }
    const [removed] = this.#items.splice(fromIndex, 1);
    this.#items.splice(toIndex, 0, removed);
    this.saveToStorage();
    this.#triggerChange();
  }

  /**
   * Vide la liste
   */
  clear() {
    this.#items = [];
    this.saveToStorage();
    this.#triggerChange();
  }

  /**
   * Remplace la liste (UUID neufs, dédoublonnage URL, plafonné à #maxItems).
   * @param {Array<{ url: string, title?: string, channel?: string, duration?: number|null, thumbnail?: string|null }>} items
   */
  replaceAll(items) {
    const raw = Array.isArray(items) ? items : [];
    const next = [];
    for (const src of raw) {
      if (next.length >= this.#maxItems) break;
      const url = src?.url;
      if (!url || typeof url !== 'string') continue;
      if (next.some((i) => i.url === url)) continue;
      next.push({
        id: crypto.randomUUID(),
        url,
        title: src.title ?? 'Sans titre',
        channel: src.channel ?? '—',
        duration: src.duration ?? null,
        thumbnail: src.thumbnail ?? null,
      });
    }
    this.#items = next;
    this.saveToStorage();
    this.#triggerChange();
  }

  /**
   * Obtient tous les items
   * @returns {Array}
   */
  getAll() {
    return [...this.#items];
  }

  /**
   * Obtient les URLs pour le téléchargement
   * @returns {string[]}
   */
  getUrls() {
    return this.#items.map(i => i.url);
  }

  /**
   * Nombre d'items
   */
  get count() {
    return this.#items.length;
  }

  /**
   * Vérifie si la liste est vide
   */
  get isEmpty() {
    return this.#items.length === 0;
  }

  /**
   * Enregistre un callback de changement (plusieurs abonnés possibles).
   * @param {() => void} callback
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.#onChangeListeners.push(callback);
    }
  }

  #triggerChange() {
    for (const fn of this.#onChangeListeners) {
      try {
        fn();
      } catch (err) {
        console.error('[DownloadList] onChange:', err);
      }
    }
  }

  /**
   * Sauvegarde dans localStorage
   */
  saveToStorage() {
    try {
      localStorage.setItem('yt-download-list', JSON.stringify(this.#items));
    } catch (err) {
      console.error('Échec sauvegarde liste:', err);
    }
  }

  /**
   * Charge depuis localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem('yt-download-list');
      if (stored) {
        this.#items = JSON.parse(stored);
      }
    } catch (err) {
      console.error('Échec chargement liste:', err);
      this.#items = [];
    }
  }
}
