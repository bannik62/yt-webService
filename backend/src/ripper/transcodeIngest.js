import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import {
  DOWNLOAD_OUTPUT_AUDIO,
  DOWNLOAD_OUTPUT_VIDEO
} from './runDownload.js';

/**
 * @param {object} job
 * @param {string} extLower — extension fichier ingéré (avec point)
 */
export function needsWorkerIngestTranscode(job, extLower) {
  if (!job?.workerIngest) return false;
  if (job.output === DOWNLOAD_OUTPUT_AUDIO) {
    return (
      extLower !== '.mp3' &&
      ['.webm', '.m4a', '.opus', '.mkv', '.mp4'].includes(extLower)
    );
  }
  if (job.output === DOWNLOAD_OUTPUT_VIDEO) {
    return extLower !== '.mp4' && ['.webm', '.mkv'].includes(extLower);
  }
  return false;
}

/**
 * @param {string} ffmpegBin
 * @param {string} inputPath
 * @returns {Promise<number | null>} durée en secondes
 */
function probeDurationSec(ffmpegBin, inputPath) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegBin, ['-hide_banner', '-i', inputPath], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let err = '';
    p.stderr?.on('data', (c) => {
      err += c.toString();
      if (err.length > 64_000) p.kill('SIGKILL');
    });
    p.on('close', () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(err);
      if (!m) return resolve(null);
      const h = Number(m[1]);
      const min = Number(m[2]);
      const sec = Number(m[3]);
      if (!Number.isFinite(h + min + sec)) return resolve(null);
      resolve(h * 3600 + min * 60 + sec);
    });
    p.on('error', () => resolve(null));
  });
}

/**
 * @param {object} opts
 * @param {string} opts.ffmpegBin
 * @param {string} opts.inputPath
 * @param {string} opts.outputPath
 * @param {'audio-mp3' | 'video-mp4'} opts.mode
 * @param {(pct0to99: number) => void} [opts.onProgress]
 */
export async function transcodeWorkerIngest(opts) {
  const { ffmpegBin, inputPath, outputPath, mode, onProgress } = opts;
  const duration = await probeDurationSec(ffmpegBin, inputPath);

  const args =
    mode === 'audio-mp3'
      ? [
          '-nostdin',
          '-y',
          '-i',
          inputPath,
          '-vn',
          '-acodec',
          'libmp3lame',
          '-q:a',
          '0',
          outputPath
        ]
      : [
          '-nostdin',
          '-y',
          '-i',
          inputPath,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outputPath
        ];

  let lastEmitted = -1;
  const emit = (pct) => {
    if (!onProgress) return;
    const n = Math.max(0, Math.min(99, Math.round(pct)));
    if (n === lastEmitted) return;
    lastEmitted = n;
    onProgress(n);
  };

  await new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errBuf = '';
    p.stderr?.on('data', (c) => {
      errBuf = (errBuf + c.toString()).slice(-48_000);
      const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(errBuf);
      if (m && duration && duration > 0.1) {
        const sec =
          Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        emit((sec / duration) * 99);
      }
    });
    p.on('error', (e) => reject(e));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg a échoué (code ${code}). ${errBuf.slice(-1200).trim()}`
          )
        );
    });
  });
}

export function getFfmpegBinOrNull() {
  return ffmpegStatic || null;
}
