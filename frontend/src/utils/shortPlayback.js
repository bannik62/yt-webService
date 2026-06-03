/**
 * Entrée historique / favori lue comme Short (tag explicite ou durée ≤ 60 s).
 * @param {{ isShort?: boolean, duration?: number | null }} entry
 */
export function isShortEntry(entry) {
  if (entry?.isShort === true) return true;
  const d = Number(entry?.duration);
  return Number.isFinite(d) && d > 0 && d <= 60;
}

/**
 * @param {object} entry
 * @returns {object | null}
 */
export function entryToPlayItem(entry) {
  const videoId = String(entry?.videoId || entry?.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
  return {
    id: videoId,
    videoId,
    url: entry.url || `https://www.youtube.com/watch?v=${videoId}`,
    title: entry.title || 'Sans titre',
    channel: entry.channel ?? '—',
    channelName: entry.channelName || entry.channel,
    duration: entry.duration ?? null,
    thumbnail:
      entry.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    isShort: isShortEntry(entry),
  };
}
