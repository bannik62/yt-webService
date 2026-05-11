import path from 'node:path';
import { fileURLToPath } from 'node:url';
import youtubedl from 'youtube-dl-exec';
import { getCurrentProxy } from '../proxy/proxyManager.js';
import { getCookiesPath, hasCookies } from '../utils/cookiesHelper.js';
import { pickTrendingKeyword } from './trendingKeywords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Probe une URL YouTube pour déterminer le nombre de morceaux
 * @param {string} url
 * @param {object} options
 * @param {boolean} options.noPlaylist
 * @returns {Promise<{kind: string, count: number, title: string}>}
 */
export async function probePlaylistCount(url, { noPlaylist, proxyUrl: proxyOverride } = {}) {
  const proxyUrl = proxyOverride ?? getCurrentProxy();
  
  console.log('[probe] Analyse URL:', url);
  console.log('[probe] noPlaylist:', noPlaylist);
  if (hasCookies()) {
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
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    flags.cookies = cookiesPath;
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

/**
 * Découverte via recherche YouTube (mot-clé aléatoire)
 * @param {number} maxResults
 * @param {boolean} musicOnly
 * @returns {Promise<{items: Array, keyword: string}>}
 */
export async function getTrending(maxResults = 20, musicOnly = false, opts = {}) {
  const proxyUrl = opts.proxyUrl ?? getCurrentProxy();

  const searchTerm = pickTrendingKeyword(musicOnly);
  const searchQuery = `ytsearch${maxResults}:${searchTerm}`;

  console.log('[trending] Musique uniquement:', musicOnly);
  console.log('[trending] Mot-clé:', searchTerm);
  console.log('[trending] Recherche:', searchQuery);
  if (proxyUrl) {
    console.log('[trending] 🌐 Proxy: activé');
  }

  const flags = {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/'
  };
  
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    flags.cookies = cookiesPath;
  }
  
  if (proxyUrl) {
    flags.proxy = proxyUrl;
  }

  try {
    const data = await youtubedl(searchQuery, flags);
    
    if (!data || !Array.isArray(data.entries)) {
      console.log('[trending] Aucune entrée trouvée');
      return { items: [], keyword: searchTerm };
    }
    
    const items = data.entries
      .filter(entry => entry && entry.id)
      .map(entry => {
        // Essayer différentes sources de thumbnail
        let thumbnail = null;
        if (entry.thumbnail) {
          thumbnail = entry.thumbnail;
        } else if (entry.thumbnails && entry.thumbnails.length > 0) {
          // Prendre la meilleure qualité disponible
          const best = entry.thumbnails[entry.thumbnails.length - 1];
          thumbnail = best.url;
        } else {
          // Fallback: construire l'URL de la miniature YouTube standard
          thumbnail = `https://i.ytimg.com/vi/${entry.id}/mqdefault.jpg`;
        }
        
        return {
          id: entry.id,
          title: entry.title || 'Sans titre',
          url: `https://www.youtube.com/watch?v=${entry.id}`,
          thumbnail: thumbnail,
          duration: entry.duration || 0,
          channel: entry.uploader || entry.channel || '—'
        };
      });
    
    console.log('[trending] Résultat:', items.length, 'vidéos');
    return { items, keyword: searchTerm };
  } catch (err) {
    console.error('[trending] Erreur:', err.message);
    throw new Error('Impossible de récupérer les tendances');
  }
}
