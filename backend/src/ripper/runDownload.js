import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import youtubedl from 'youtube-dl-exec';
import { parseItemOfTotal, parseProgressLine } from './ytdlpHelpers.js';

/**
 * Lance le téléchargement MP3 avec yt-dlp + ffmpeg
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.targetDir
 * @param {boolean} opts.noPlaylist
 * @param {number} opts.maxDownloads - 0 = illimité si playlist
 * @param {(line: string) => void} opts.onLog
 * @param {(p: { filePct: number; itemIndex: number; itemTotal: number }) => void} opts.onProgress
 */
export async function runDownload(opts) {
  const {
    url,
    targetDir,
    noPlaylist,
    maxDownloads,
    onLog,
    onProgress
  } = opts;

  const limit =
    typeof maxDownloads === 'number' &&
    Number.isFinite(maxDownloads) &&
    maxDownloads > 0
      ? Math.floor(maxDownloads)
      : 0;

  const { probePlaylistCount } = await import('./probe.js');

  let plannedTotal = 1;
  let itemIndex = 1;
  let lastFilePct = 0;

  // Logs de démarrage pour debugging
  onLog('🔧 Configuration yt-dlp:');
  onLog(`   User-Agent: Chrome 131 (Windows))`);
  onLog(`   Referer: YouTube`);
  onLog(`   Headers personnalisés: ${5} headers ajoutés`);
  onLog('');
  
  onLog('Analyse de la URL…');
  let info;
  try {
    info = await probePlaylistCount(url.trim(), { noPlaylist: Boolean(noPlaylist) });
    let count = Number.isFinite(info.count) && info.count > 0 ? info.count : 1;
    if (Boolean(noPlaylist)) count = 1;
    else if (limit > 0) count = Math.min(count, limit);
    plannedTotal = Math.max(1, count);
    const label =
      info.kind === 'playlist'
        ? `Playlist « ${info.title || 'sans titre'} » : ${plannedTotal} morceau(x) à télécharger.`
        : `Une piste à télécharger${info.title ? ` — ${info.title}` : ''}.`;
    onLog(label);
    onProgress({ filePct: 0, itemIndex: 1, itemTotal: plannedTotal });
  } catch (e) {
    onLog(
      `Analyse partielle: ${e?.message || String(e)} (téléchargement quand même).`
    );
    plannedTotal = Boolean(noPlaylist) ? 1 : limit > 0 ? limit : 1;
    onProgress({ filePct: 0, itemIndex: 1, itemTotal: plannedTotal });
  }

  function emitProgress(filePct, idx) {
    const i = Math.min(Math.max(idx, 1), plannedTotal);
    onProgress({
      filePct,
      itemIndex: i,
      itemTotal: plannedTotal
    });
  }

  const outTemplate = path.join(targetDir, '%(title)s [%(id)s].%(ext)s');
  const ffmpegPath = ffmpegStatic || undefined;

  const dlFlags = {
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: '0',
    output: outTemplate,
    newline: true,
    progress: true,
    noWarnings: true,
    // Simuler un vrai navigateur Windows/Chrome pour éviter la détection bot
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/',
    // Headers supplémentaires pour ressembler à un vrai navigateur
    addHeader: [
      'Accept-Language:en-US,en;q=0.9,fr;q=0.8',
      'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Sec-Fetch-Mode:navigate',
      'Sec-Fetch-Site:none',
      'Sec-Fetch-Dest:document'
    ]
  };
  if (ffmpegPath) {
    dlFlags.ffmpegLocation = ffmpegPath;
  }
  if (Boolean(noPlaylist)) dlFlags.noPlaylist = true;
  if (!Boolean(noPlaylist) && limit > 0) dlFlags.maxDownloads = limit;

  onLog('🚀 Lancement du téléchargement...');
  console.log('[yt-dlp] Flags:', JSON.stringify(dlFlags, null, 2));
  console.log('[yt-dlp] URL:', url.trim());

  const child = youtubedl.exec(url.trim(), dlFlags, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const sendLine = (line) => {
    onLog(line);
    const meta = parseItemOfTotal(line);
    if (meta && meta.item > 0) {
      itemIndex = Math.min(meta.item, plannedTotal);
    }
    const pct = parseProgressLine(line);
    if (pct != null) {
      if (pct < 5 && lastFilePct > 85 && itemIndex < plannedTotal && !meta) {
        itemIndex++;
      }
      lastFilePct = pct;
      emitProgress(pct, itemIndex);
    }
  };

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    text.split(/\r?\n/).filter(Boolean).forEach(sendLine);
  });
  child.stderr?.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    text.split(/\r?\n/).filter(Boolean).forEach(sendLine);
  });

  await child;
  console.log('[yt-dlp] Téléchargement terminé avec succès');
  onLog('✅ Téléchargement terminé !');
  emitProgress(100, plannedTotal);
}
