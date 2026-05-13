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
 * Pourcentage approximatif quand yt-dlp passe merge / ffmpeg sans ligne `[download] …%`.
 * @param {string} line
 * @param {number} [lastPct]
 * @returns {number|null}
 */
export function inferPhaseProgressHint(line, lastPct = 0) {
  const lp =
    typeof lastPct === 'number' && Number.isFinite(lastPct) ? lastPct : 0;
  if (/\[Merger\]|Merging formats into/i.test(line)) {
    return Math.max(lp, 90);
  }
  if (/\[ExtractAudio\]|Destination:\s*.+\.(?:mp3|m4a|opus)/i.test(line)) {
    return Math.max(lp, 85);
  }
  if (/\[Fixup\]|Correcting container/i.test(line)) {
    return Math.max(lp, 96);
  }
  const ffmpegPct = line.match(/\[download\]\s+[^[\]]*?(\d+(?:\.\d+)?)%/);
  if (ffmpegPct) return Math.max(lp, Number(ffmpegPct[1]));
  return null;
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
