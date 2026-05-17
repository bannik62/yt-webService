import { describe, it, expect } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';

/**
 * Copie locale de sanitizeJobLogLineForSse (JobManager) pour tests sans exporter la privée.
 * Garder aligné avec JobManager.js si la logique change.
 * @param {string} line
 */
function sanitizeJobLogLineForSse(line) {
  function safeBasenameFromPath(p) {
    const t = String(p || '').trim();
    if (!t) return '';
    const base = path.basename(t.replace(/\\/g, '/'));
    return base && base !== '.' && base !== '..' ? base : '';
  }

  let s = String(line).replace(/\r/g, '');
  const t = s.trim();

  const downloadDest = t.match(/^\[download\]\s*Destination:\s*(.+)$/i);
  if (downloadDest) {
    const name = safeBasenameFromPath(downloadDest[1]);
    return name ? `[download] ${name}` : '[download]';
  }

  return s.trimEnd();
}

describe('sanitizeJobLogLineForSse (log téléchargement)', () => {
  it('masque le chemin tmp dans Destination', () => {
    const jobDir = path.join(os.tmpdir(), 'yt-ripper-jobs', 'uuid-1234');
    const line = `[download] Destination: ${jobDir}/ma-video.mp4`;
    expect(sanitizeJobLogLineForSse(line)).toBe('[download] ma-video.mp4');
  });

  it('ligne sans Destination inchangée (hors préfixes spéciaux)', () => {
    expect(sanitizeJobLogLineForSse('100%')).toBe('100%');
  });
});
