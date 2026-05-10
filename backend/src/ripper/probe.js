import path from 'node:path';
import { fileURLToPath } from 'node:url';
import youtubedl from 'youtube-dl-exec';
import fs from 'node:fs';
import { getCurrentProxy } from '../proxy/proxyManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, '..', '..', 'cookies.txt');

// Vérifier si le fichier cookies existe
const hasCookies = fs.existsSync(COOKIES_PATH);

/**
 * Probe une URL YouTube pour déterminer le nombre de morceaux
 * @param {string} url
 * @param {object} options
 * @param {boolean} options.noPlaylist
 * @returns {Promise<{kind: string, count: number, title: string}>}
 */
export async function probePlaylistCount(url, { noPlaylist } = {}) {
  const proxyUrl = getCurrentProxy();
  
  console.log('[probe] Analyse URL:', url);
  console.log('[probe] noPlaylist:', noPlaylist);
  if (hasCookies) {
    console.log('[probe] 🍪 Cookies: activés');
  }
  if (proxyUrl) {
    console.log('[probe] 🌐 Proxy: activé');
  }
  
  const flags = {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    // Mêmes headers que pour le téléchargement (Chrome 2026)
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/'
  };
  
  // Utiliser les cookies si disponibles
  if (hasCookies) {
    flags.cookies = COOKIES_PATH;
  }
  
  // Utiliser un proxy si configuré
  if (proxyUrl) {
    flags.proxy = proxyUrl;
  }
  
  if (noPlaylist) flags.noPlaylist = true;

  const data = await youtubedl(url, flags);
  console.log('[probe] Résultat:', data ? `${data.entries?.length || 1} item(s)` : 'vide');
  
  if (data && Array.isArray(data.entries) && data.entries.length > 0) {
    console.log('[probe] Type: playlist avec', data.entries.length, 'items');
    return { 
      kind: 'playlist', 
      count: data.entries.length, 
      title: data.title || '' 
    };
  }
  
  if (data && data.id) {
    console.log('[probe] Type: single video');
    return { 
      kind: 'single', 
      count: 1, 
      title: data.title || '' 
    };
  }
  
  console.log('[probe] Type: unknown/fallback');
  return { 
    kind: 'unknown', 
    count: 1, 
    title: (data && data.title) || '' 
  };
}
