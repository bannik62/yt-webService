import Dexie from 'dexie';

/** Limite du nombre de playlists nommées (IndexedDB). */
export const MAX_SAVED_PLAYLISTS = 40;

/**
 * Playlists nommées — IndexedDB via Dexie (indépendant de « Ma liste » localStorage).
 */
export class SavedPlaylistsDB extends Dexie {
  constructor() {
    super('yt-ripper-saved-playlists');
    this.version(1).stores({
      playlists: '++id, name, updatedAt',
      playlistItems: '++id, playlistId, sortOrder',
    });
  }
}

export const savedPlaylistsDb = new SavedPlaylistsDB();

/**
 * @returns {Promise<Array<{ id: number, name: string, createdAt: number, updatedAt: number }>>}
 */
export async function listPlaylistSummaries() {
  return savedPlaylistsDb.playlists.orderBy('updatedAt').reverse().toArray();
}

/**
 * @param {string} name
 * @param {Array<{ url: string, title?: string, channel?: string, duration?: number|null, thumbnail?: string|null }>} items
 */
export async function createPlaylist(name, items) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nom vide');

  const count = await savedPlaylistsDb.playlists.count();
  if (count >= MAX_SAVED_PLAYLISTS) {
    throw new Error(`Nombre maximum de playlists (${MAX_SAVED_PLAYLISTS}) atteint`);
  }

  const now = Date.now();
  const playlistId = await savedPlaylistsDb.playlists.add({
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  });

  const rows = (Array.isArray(items) ? items : []).map((it, sortOrder) => ({
    playlistId,
    sortOrder,
    url: it.url,
    title: it.title ?? '',
    channel: it.channel ?? '',
    duration: it.duration ?? null,
    thumbnail: it.thumbnail ?? null,
  }));

  if (rows.length > 0) {
    await savedPlaylistsDb.playlistItems.bulkAdd(rows);
  }

  return playlistId;
}

/**
 * @param {number} playlistId
 * @returns {Promise<Array<{ url: string, title?: string, channel?: string, duration?: number|null, thumbnail?: string|null }>>}
 */
export async function getPlaylistItems(playlistId) {
  const rows = await savedPlaylistsDb.playlistItems
    .where('playlistId')
    .equals(playlistId)
    .sortBy('sortOrder');
  return rows.map((r) => ({
    url: r.url,
    title: r.title,
    channel: r.channel,
    duration: r.duration,
    thumbnail: r.thumbnail,
  }));
}

/**
 * @param {number} playlistId
 */
export async function deletePlaylist(playlistId) {
  await savedPlaylistsDb.transaction(
    'rw',
    savedPlaylistsDb.playlists,
    savedPlaylistsDb.playlistItems,
    async () => {
      await savedPlaylistsDb.playlistItems.where('playlistId').equals(playlistId).delete();
      await savedPlaylistsDb.playlists.delete(playlistId);
    }
  );
}
