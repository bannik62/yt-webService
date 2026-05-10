import youtubedl from 'youtube-dl-exec';

/**
 * Probe une URL YouTube pour déterminer le nombre de morceaux
 * @param {string} url
 * @param {object} options
 * @param {boolean} options.noPlaylist
 * @returns {Promise<{kind: string, count: number, title: string}>}
 */
export async function probePlaylistCount(url, { noPlaylist } = {}) {
  const flags = {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    // Mêmes headers que pour le téléchargement
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/'
  };
  if (noPlaylist) flags.noPlaylist = true;

  const data = await youtubedl(url, flags);
  
  if (data && Array.isArray(data.entries) && data.entries.length > 0) {
    return { 
      kind: 'playlist', 
      count: data.entries.length, 
      title: data.title || '' 
    };
  }
  
  if (data && data.id) {
    return { 
      kind: 'single', 
      count: 1, 
      title: data.title || '' 
    };
  }
  
  return { 
    kind: 'unknown', 
    count: 1, 
    title: (data && data.title) || '' 
  };
}
