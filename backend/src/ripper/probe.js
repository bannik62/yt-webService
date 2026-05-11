import path from 'node:path';
import { fileURLToPath } from 'node:url';
import youtubedl from 'youtube-dl-exec';
import { getCurrentProxy } from '../proxy/proxyManager.js';
import { getCookiesPath, hasCookies } from '../utils/cookiesHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
 * Récupère les vidéos tendances pour un pays donné
 * @param {string} countryCode - Code pays ISO (FR, US, GB, etc.)
 * @param {number} maxResults - Nombre max de résultats (défaut: 20)
 * @returns {Promise<{items: Array}>}
 */
export async function getTrending(countryCode = 'US', maxResults = 20) {
  const proxyUrl = getCurrentProxy();
  
  // Utiliser une recherche YouTube avec des termes génériques populaires
  // Pour avoir du contenu varié et populaire
  const searchQuery = `ytsearch${maxResults}:trending ${new Date().getFullYear()}`; 
  
  console.log('[trending] Pays:', countryCode);
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
    referer: 'https://www.youtube.com/',
    // Forcer la région pour les résultats localisés
    geoBypass: true,
    geoBypassCountry: countryCode,
    // Demander explicitement les thumbnails
    writeThumbnail: false,
    listThumbnails: false
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
      return { items: [] };
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
    return { items };
  } catch (err) {
    console.error('[trending] Erreur:', err.message);
    throw new Error('Impossible de récupérer les tendances');
  }
}
