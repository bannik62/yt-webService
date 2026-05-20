import { $ } from '../utils/dom.js';
import {
  listPlaylistSummaries,
  createPlaylist,
  getPlaylistItems,
  deletePlaylist,
} from '../db/savedPlaylistsDb.js';

/**
 * Barre « playlists enregistrées » dans la sidebar (IndexedDB).
 */
export class SavedPlaylistsBar {
  /**
   * @param {import('../models/DownloadList.js').DownloadList} downloadList
   */
  constructor(downloadList) {
    this.downloadList = downloadList;
    this.selectEl = $('#saved-playlist-select');
    this.loadBtn = $('#saved-playlist-load');
    this.saveBtn = $('#saved-playlist-save');
    this.deleteBtn = $('#saved-playlist-delete');

    if (!this.selectEl || !this.loadBtn || !this.saveBtn || !this.deleteBtn) {
      return;
    }

    this.loadBtn.addEventListener('click', () => void this._onLoad());
    this.saveBtn.addEventListener('click', () => void this._onSave());
    this.deleteBtn.addEventListener('click', () => void this._onDelete());
    this.selectEl.addEventListener('change', () => this._syncDeleteEnabled());

    void this.refreshOptions();
  }

  _syncDeleteEnabled() {
    const id = Number.parseInt(String(this.selectEl?.value ?? ''), 10);
    if (this.deleteBtn) {
      this.deleteBtn.disabled = !Number.isFinite(id) || id <= 0;
    }
  }

  /** @returns {number|null} */
  _selectedId() {
    const raw = this.selectEl?.value;
    const id = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  async refreshOptions() {
    if (!this.selectEl) return;
    const prev = this._selectedId();
    let summaries = [];
    try {
      summaries = await listPlaylistSummaries();
    } catch (e) {
      console.error('[SavedPlaylists]', e);
      return;
    }

    this.selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Choisir —';
    this.selectEl.appendChild(placeholder);

    for (const p of summaries) {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name;
      this.selectEl.appendChild(opt);
    }

    if (prev && summaries.some((s) => s.id === prev)) {
      this.selectEl.value = String(prev);
    }
    this._syncDeleteEnabled();
  }

  async _onLoad() {
    const id = this._selectedId();
    if (!id) {
      alert('Choisis une playlist enregistrée.');
      return;
    }
    if (!this.downloadList.isEmpty) {
      const ok = confirm(
        'Remplacer « Ma liste » actuelle par cette playlist ? (les éléments non enregistrés ailleurs seront perdus.)'
      );
      if (!ok) return;
    }
    let items = [];
    try {
      items = await getPlaylistItems(id);
    } catch (e) {
      console.error(e);
      alert('Impossible de lire cette playlist.');
      return;
    }
    if (items.length === 0) {
      alert('Cette playlist est vide.');
      return;
    }
    this.downloadList.replaceAll(items);
  }

  async _onSave() {
    const items = this.downloadList.getAll();
    if (items.length === 0) {
      alert('« Ma liste » est vide — rien à enregistrer.');
      return;
    }
    const name = window.prompt('Nom de la playlist enregistrée :', '');
    if (name === null) return;
    const trimmed = String(name).trim();
    if (!trimmed) {
      alert('Nom obligatoire.');
      return;
    }
    try {
      await createPlaylist(
        trimmed,
        items.map((i) => ({
          url: i.url,
          title: i.title,
          channel: i.channel,
          duration: i.duration,
          thumbnail: i.thumbnail,
        }))
      );
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Enregistrement impossible (IndexedDB ou quota).');
      return;
    }
    await this.refreshOptions();
    alert(`Playlist « ${trimmed} » enregistrée.`);
  }

  async _onDelete() {
    const id = this._selectedId();
    if (!id) return;
    const name =
      this.selectEl?.selectedOptions?.[0]?.textContent?.trim() || 'cette playlist';
    if (!confirm(`Supprimer définitivement « ${name} » ?`)) return;
    try {
      await deletePlaylist(id);
    } catch (e) {
      console.error(e);
      alert('Suppression impossible.');
      return;
    }
    await this.refreshOptions();
  }
}
