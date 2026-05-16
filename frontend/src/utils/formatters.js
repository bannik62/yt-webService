/**
 * Formateurs de données
 */

/**
 * Formate une durée en secondes au format HH:MM:SS ou MM:SS
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Échappe les caractères HTML
 * @param {string} str
 * @returns {string}
 */
/**
 * Date / heure de dernière lecture (historique).
 * @param {string} iso
 * @returns {string}
 */
/**
 * Date de mise en ligne (YYYY-MM-DD ou ISO).
 * @param {string | null | undefined} ymd
 * @returns {string}
 */
export function formatUploadDate(ymd) {
  if (!ymd) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ymd)
    ? new Date(`${ymd}T12:00:00`)
    : new Date(ymd);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatPlayedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
