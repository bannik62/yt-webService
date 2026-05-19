/**
 * Vignettes Open Graph (proxy i.ytimg.com, même domaine que le site).
 */

const UPSTREAM_UA = 'yt-webService-share-thumb/1.0';
const FETCH_TIMEOUT_MS = 12000;
/** En dessous : souvent la pastille « pas de maxres » YouTube (~120×90). */
const MIN_OG_WIDTH = 600;

/** @type {ReadonlyArray<{ slug: string; fallbackW: number; fallbackH: number }>} */
const THUMB_VARIANTS = [
  { slug: 'maxresdefault', fallbackW: 1280, fallbackH: 720 },
  { slug: 'hqdefault', fallbackW: 480, fallbackH: 360 },
  { slug: 'mqdefault', fallbackW: 320, fallbackH: 180 }
];

/**
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number } | null}
 */
export function parseJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) break;
    if (i + 3 >= buffer.length) break;
    const segLen = buffer.readUInt16BE(i + 2);
    if (segLen < 2) break;

    if (marker === 0xc0 || marker === 0xc2) {
      if (i + 8 >= buffer.length) break;
      const height = buffer.readUInt16BE(i + 5);
      const width = buffer.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
    }
    i += 2 + segLen;
  }
  return null;
}

/**
 * @param {string} videoId
 * @param {string} slug
 * @returns {string}
 */
function youtubeThumbUrl(videoId, slug) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${slug}.jpg`;
}

/**
 * @param {string} videoId
 * @param {import('fastify').FastifyBaseLogger} [log]
 * @returns {Promise<{ buffer: Buffer; contentType: string; width: number; height: number }>}
 */
export async function fetchShareThumbnail(videoId, log) {
  let lastErr = null;

  for (const variant of THUMB_VARIANTS) {
    const upstream = youtubeThumbUrl(videoId, variant.slug);
    try {
      const res = await fetch(upstream, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': UPSTREAM_UA }
      });
      if (!res.ok) {
        lastErr = new Error(`upstream ${res.status}`);
        continue;
      }
      const ctype = res.headers.get('content-type') || 'image/jpeg';
      if (!ctype.startsWith('image/')) {
        lastErr = new Error(`not an image: ${ctype}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 2048) {
        lastErr = new Error('body too small');
        continue;
      }
      const parsed = parseJpegDimensions(buffer);
      const width = parsed?.width ?? variant.fallbackW;
      const height = parsed?.height ?? variant.fallbackH;
      if (width < MIN_OG_WIDTH && variant.slug === 'maxresdefault') {
        lastErr = new Error(`maxres too small (${width}px)`);
        continue;
      }
      return {
        buffer,
        contentType: ctype.startsWith('image/') ? ctype : 'image/jpeg',
        width,
        height
      };
    } catch (err) {
      lastErr = err;
      log?.warn?.({ err, videoId, variant: variant.slug }, 'share-thumb: variant');
    }
  }

  throw lastErr || new Error('no thumbnail');
}
