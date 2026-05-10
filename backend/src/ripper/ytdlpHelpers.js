/**
 * Helpers pour parser la sortie de yt-dlp
 * Aligné sur yt-ripper/electron/main.js
 */

/**
 * Parse le pourcentage de progression depuis une ligne yt-dlp
 * @param {string} line
 * @returns {number|null}
 */
export function parseProgressLine(line) {
  const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Parse "item N of Total" depuis une ligne yt-dlp
 * @param {string} line
 * @returns {{item: number, total: number}|null}
 */
export function parseItemOfTotal(line) {
  const patterns = [
    /Downloading (?:video|item)\s+(\d+)\s+of\s+(\d+)/i,
    /\[download\]\s+(\d+)\s*\/\s*(\d+)/,
    /\[download\]\s+(\d+)\s+of\s+(\d+)/i
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (m) return { item: Number(m[1]), total: Number(m[2]) };
  }
  return null;
}
