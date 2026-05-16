/**
 * Normalise la date de mise en ligne yt-dlp (YYYYMMDD ou timestamp).
 * @param {Record<string, unknown>} row
 * @returns {string | null} ISO date YYYY-MM-DD
 */
export function normalizeUploadDate(row) {
  if (!row || typeof row !== 'object') return null;

  const raw = row.upload_date ?? row.release_date;
  if (typeof raw === 'string' && /^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  const ts = row.timestamp ?? row.release_timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts * 1000);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  return null;
}
