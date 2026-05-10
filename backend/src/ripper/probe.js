import youtubedl from 'youtube-dl-exec';

// Charger les credentials YouTube depuis les variables d'environnement
const YOUTUBE_USERNAME = process.env.YOUTUBE_USERNAME || '';
const YOUTUBE_PASSWORD = process.env.YOUTUBE_PASSWORD || '';

/**
 * Probe une URL YouTube pour déterminer le nombre de morceaux
 * @param {string} url
 * @param {object} options
 * @param {boolean} options.noPlaylist
 * @returns {Promise<{kind: string, count: number, title: string}>}
 */
export async function probePlaylistCount(url, { noPlaylist } = {}) {
  console.log('[probe] Analyse URL:', url);
  console.log('[probe] noPlaylist:', noPlaylist);
  if (YOUTUBE_USERNAME && YOUTUBE_PASSWORD) {
    console.log('[probe] 🔐 Connexion YouTube:', YOUTUBE_USERNAME);
  }
  
  const flags = {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    // Mêmes headers que pour le téléchargement
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/'
  };
  
  // Ajouter les credentials YouTube si disponibles
  if (YOUTUBE_USERNAME && YOUTUBE_PASSWORD) {
    flags.username = YOUTUBE_USERNAME;
    flags.password = YOUTUBE_PASSWORD;
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
