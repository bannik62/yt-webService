/** Limite stricte playlists (mode Ripper MP3, cohérence probe / yt-dlp). */
export const PLAYLIST_MAX_TRACKS = 10;

/**
 * @param {boolean} noPlaylist
 * @param {unknown} maxDownloads
 * @returns {number} 0 si une seule piste, sinon 1..PLAYLIST_MAX_TRACKS
 */
export function normalizePlaylistMaxDownloads(noPlaylist, maxDownloads) {
  if (Boolean(noPlaylist)) return 0;
  const n = Number(maxDownloads);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(Math.floor(n), PLAYLIST_MAX_TRACKS);
  }
  return PLAYLIST_MAX_TRACKS;
}
