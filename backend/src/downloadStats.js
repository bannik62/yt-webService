import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'download-stats.json');

/** @type {Promise<void>} */
let writeChain = Promise.resolve();

function statsPath() {
  const p = process.env.DOWNLOAD_STATS_PATH?.trim();
  return p && p.length > 0 ? p : DEFAULT_PATH;
}

/**
 * @returns {Promise<{ totalJobs: number, totalFiles: number, updatedAt: string }>}
 */
export async function readDownloadStats() {
  try {
    const raw = await fs.readFile(statsPath(), 'utf8');
    const j = JSON.parse(raw);
    return {
      totalJobs: Math.max(0, Math.floor(Number(j.totalJobs)) || 0),
      totalFiles: Math.max(0, Math.floor(Number(j.totalFiles)) || 0),
      updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : ''
    };
  } catch {
    return { totalJobs: 0, totalFiles: 0, updatedAt: '' };
  }
}

/**
 * Compte un job terminé avec succès (VPS). Sérialise les écritures disque.
 * @param {{ files?: number }} [opts]
 */
export function incrementDownloadStats(opts = {}) {
  const files = Math.max(1, Math.floor(Number(opts.files) || 1));
  writeChain = writeChain
    .then(() => incrementDownloadStatsUnlocked(files))
    .catch((err) => {
      console.error('[downloadStats]', err);
    });
  return writeChain;
}

/**
 * @param {number} files
 */
async function incrementDownloadStatsUnlocked(files) {
  try {
    const filePath = statsPath();
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    let cur = await readDownloadStats();
    cur = {
      totalJobs: cur.totalJobs + 1,
      totalFiles: cur.totalFiles + files,
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(filePath, `${JSON.stringify(cur, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.error('[downloadStats] écriture impossible:', err);
  }
}
