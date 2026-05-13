import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import youtubedl from 'youtube-dl-exec';
import {
  inferPhaseProgressHint,
  parseItemOfTotal,
  parseProgressLine
} from './ytdlpHelpers.js';
import { getCurrentProxy } from '../proxy/proxyManager.js';
import { getCookiesPath, hasCookies } from '../utils/cookiesHelper.js';
import {
  ProxyQuotaError,
  isProxyQuotaMessage
} from './proxyQuotaError.js';

export const DOWNLOAD_OUTPUT_AUDIO = 'audio';
export const DOWNLOAD_OUTPUT_VIDEO = 'video';

/**
 * Lance le téléchargement avec yt-dlp + ffmpeg (MP3 ou MP4 selon output).
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.targetDir
 * @param {boolean} opts.noPlaylist
 * @param {number} opts.maxDownloads - 0 si une seule piste ; sinon limite playlist
 * @param {'audio' | 'video'} [opts.output] - défaut audio (MP3)
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
    onProgress,
    proxyUrl: proxyOverride = null,
    output: outputRaw = DOWNLOAD_OUTPUT_AUDIO
  } = opts;

  const output =
    outputRaw === DOWNLOAD_OUTPUT_VIDEO
      ? DOWNLOAD_OUTPUT_VIDEO
      : DOWNLOAD_OUTPUT_AUDIO;

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

  const proxyUrl = proxyOverride ?? getCurrentProxy();

  onLog('🔧 Configuration yt-dlp:');
  onLog(`   User-Agent: Chrome 149 (Windows, 2026)`);
  onLog(`   Referer: YouTube`);
  onLog(`   Headers personnalisés: 2 headers ajoutés (Accept, Accept-Language)`);
  if (hasCookies()) {
    onLog(`   🍪 Cookies: activés (cookies.txt)`);
  } else {
    onLog(`   ⚠️ Cookies: non disponibles (mode anonyme)`);
  }
  if (proxyUrl) {
    // Masquer le password dans les logs
    const maskedProxy = proxyUrl.replace(/:([^:@]+)@/, ':****@');
    onLog(`   🌐 Proxy: activé (${maskedProxy})`);
  } else {
    onLog(`   ⚠️ Proxy: non configuré (IP VPS directe)`);
  }
  onLog('');
  
  onLog('Analyse de la URL…');
  let info;
  try {
    info = await probePlaylistCount(url.trim(), {
      noPlaylist: Boolean(noPlaylist),
      proxyUrl
    });
    let count = Number.isFinite(info.count) && info.count > 0 ? info.count : 1;
    if (Boolean(noPlaylist)) count = 1;
    else if (limit > 0) count = Math.min(count, limit);
    plannedTotal = Math.max(1, count);
    const kindLabel = output === DOWNLOAD_OUTPUT_VIDEO ? 'vidéo(s)' : 'morceau(x)';
    const label =
      info.kind === 'playlist'
        ? `Playlist « ${info.title || 'sans titre'} » : ${plannedTotal} ${kindLabel} à télécharger.`
        : `Une piste à télécharger${info.title ? ` — ${info.title}` : ''}.`;
    onLog(label);
    onProgress({ filePct: 0, itemIndex: 1, itemTotal: plannedTotal });
  } catch (e) {
    const probeTxt = `${e?.message ?? ''}\n${e?.cause?.message ?? ''}`;
    if (isProxyQuotaMessage(probeTxt)) {
      console.warn(
        '[Proxy] Tunnel / quota (402 Payment Required ou équivalent) — réponse du proxy lors de la phase analyse yt-dlp (WebShare / uplink quota).'
      );
      throw new ProxyQuotaError(probeTxt.trim().slice(0, 2048));
    }
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
    output: outTemplate,
    newline: true,
    progress: true,
    noWarnings: true,
    // Simuler un vrai navigateur Windows/Chrome 2026 pour éviter la détection bot
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    referer: 'https://www.youtube.com/',
    // Headers supplémentaires pour ressembler à un vrai navigateur
    addHeader: [
      'Accept-Language: en-US,en;q=0.9',
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      // Sec-Fetch-* supprimés: auto-générés par navigateurs, inutiles pour yt-dlp
    ]
  };

  if (output === DOWNLOAD_OUTPUT_VIDEO) {
    dlFlags.format = 'bestvideo+bestaudio/best';
    dlFlags.mergeOutputFormat = 'mp4';
    onLog('📹 Sortie : vidéo MP4 (meilleur flux vidéo + audio)');
  } else {
    dlFlags.extractAudio = true;
    dlFlags.audioFormat = 'mp3';
    dlFlags.audioQuality = '0';
    onLog('🎵 Sortie : audio MP3');
  }
  
  // Utiliser les cookies si disponibles (plus fiable que username/password)
  const cookiesPath = getCookiesPath();
  if (cookiesPath) {
    dlFlags.cookies = cookiesPath;
  }
  
  // Utiliser un proxy si configuré (pour contourner le blocage YouTube sur VPS)
  if (proxyUrl) {
    dlFlags.proxy = proxyUrl;
  }
  
  if (ffmpegPath) {
    dlFlags.ffmpegLocation = ffmpegPath;
  }
  if (Boolean(noPlaylist)) dlFlags.noPlaylist = true;
  if (!Boolean(noPlaylist) && limit > 0) dlFlags.maxDownloads = limit;

  onLog('🚀 Lancement du téléchargement...');
  console.log('[yt-dlp] Flags:', JSON.stringify(dlFlags, null, 2));
  console.log('[yt-dlp] URL:', url.trim());

  const child = youtubedl.exec(url.trim(), dlFlags, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  /** Log stderr pour analyse d’erreurs (dont 402 quota proxy). */
  let stderrCaptured = '';

  /**
   * yt-dlp réécrit souvent la ligne de % avec \r sans \n ; split('\n') seul masque la progression.
   */
  function createCrLfFeed() {
    let buf = '';
    return (chunk) => {
      buf += chunk.toString('utf8');
      const normalized = buf.replace(/\r/g, '\n');
      const parts = normalized.split('\n');
      buf = parts.pop() ?? '';
      return parts;
    };
  }

  const feedStdout = createCrLfFeed();
  const feedStderr = createCrLfFeed();

  const sendLine = (line) => {
    const meta = parseItemOfTotal(line);
    if (meta && meta.item > 0) {
      itemIndex = Math.min(meta.item, plannedTotal);
    }
    const pct = parseProgressLine(line);
    const phasePct =
      pct == null ? inferPhaseProgressHint(line, lastFilePct) : null;

    if (pct == null) {
      onLog(line);
    }

    if (pct != null) {
      if (pct < 5 && lastFilePct > 85 && itemIndex < plannedTotal && !meta) {
        itemIndex++;
      }
      lastFilePct = pct;
      emitProgress(pct, itemIndex);
    } else if (phasePct != null && phasePct !== lastFilePct) {
      lastFilePct = phasePct;
      emitProgress(phasePct, itemIndex);
    }
  };

  child.stdout?.on('data', (chunk) => {
    for (const raw of feedStdout(chunk)) {
      const t = raw.trim();
      if (t) sendLine(t);
    }
  });
  child.stderr?.on('data', (chunk) => {
    stderrCaptured += chunk.toString('utf8');
    for (const raw of feedStderr(chunk)) {
      const t = raw.trim();
      if (t) sendLine(t);
    }
  });

  try {
    await child;
  } catch (execErr) {
    const bundled = [
      stderrCaptured,
      execErr instanceof Error ? execErr.message : '',
      execErr &&
      typeof execErr === 'object' &&
      'stderr' in execErr &&
      String(execErr.stderr)
    ]
      .filter(Boolean)
      .join('\n');
    if (isProxyQuotaMessage(bundled)) {
      console.warn(
        '[Proxy] Tunnel / quota (402 Payment Required ou équivalent) — réponse du proxy pendant yt-dlp (WebShare / uplink quota).'
      );
      throw new ProxyQuotaError(
        bundled.trim().slice(0, 4096) || 'Proxy quota (402)'
      );
    }
    throw execErr;
  }
  console.log('[yt-dlp] Téléchargement terminé avec succès');
  onLog('✅ Téléchargement terminé !');
  emitProgress(100, plannedTotal);
}
