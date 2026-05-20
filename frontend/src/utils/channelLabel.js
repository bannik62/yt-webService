/**
 * Libellé chaîne affichable / enregistrable (stats, favoris).
 * @param {unknown} raw
 * @returns {string}
 */
export function validChannelLabel(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (t === '—' || t === '-' || t === '–') return '';
  if (/^unknown$/i.test(t)) return '';
  if (/^youtube$/i.test(t)) return '';
  return t;
}

/**
 * @param {object | null | undefined} item
 * @returns {string}
 */
export function channelLabelFromItem(item) {
  if (!item) return '';
  return (
    validChannelLabel(item.channel) ||
    validChannelLabel(item.channelName) ||
    validChannelLabel(item.uploader) ||
    ''
  );
}
