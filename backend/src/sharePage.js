/**
 * Page HTML minimale pour partage (Open Graph + lien vers l’app).
 * Les crawlers d’aperçu reçoivent le HTML OG ; les navigateurs sont redirigés vers /?v=.
 */

/** Identifiant vidéo classique YouTube (11 caractères). */
const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isValidYoutubeVideoId(id) {
  return typeof id === 'string' && YOUTUBE_VIDEO_ID_RE.test(id.trim());
}

/**
 * @param {string} s
 * @returns {string}
 */
export function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Hôte canonique dérivé de `CORS_ORIGIN` si c’est une URL https (prod derrière proxy http interne).
 * @returns {string}
 */
function corsHttpsCanonicalHost() {
  const c = (process.env.CORS_ORIGIN || '').trim();
  const m = /^https:\/\/([^/:?#]+)/i.exec(c);
  return m ? m[1].split(':')[0].toLowerCase() : '';
}

/**
 * RFC 7239 `Forwarded: proto=https;host=…`
 * @param {import('fastify').FastifyRequest} request
 * @returns {'http' | 'https' | null}
 */
function protoFromForwardedHeader(request) {
  const raw = request.headers.forwarded;
  if (raw === undefined || raw === null || raw === '') return null;
  const first = String(Array.isArray(raw) ? raw[0] : raw).split(',')[0];
  const m = /proto=([^;\s]+)/i.exec(first);
  if (!m) return null;
  const v = m[1].toLowerCase().replace(/^"+|"+$/g, '');
  if (v === 'https' || v === 'http') return v;
  return null;
}

/**
 * Indices courants quand le TLS est terminé en amont mais X-Forwarded-Proto vaut encore http / vide.
 * @param {import('fastify').FastifyRequest} request
 */
function inferHttpsFromProxyHints(request) {
  const ssl = String(request.headers['x-forwarded-ssl'] || '').toLowerCase();
  if (ssl === 'on' || ssl === '1') return true;
  const fe = String(request.headers['front-end-https'] || '').toLowerCase();
  if (fe === 'on') return true;
  const port = String(
    request.headers['x-forwarded-port'] || ''
  ).split(',')[0].trim();
  if (port === '443') return true;
  return false;
}

/** @param {string} hostOnly */
function isLocalDevHost(hostOnly) {
  const h = hostOnly.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h.endsWith('.local')
  );
}

/**
 * URL publique du site (OG, canonical). Préfère SITE_URL puis en-têtes reverse-proxy.
 * @param {import('fastify').FastifyRequest} request
 * @returns {string}
 */
export function buildPublicOrigin(request) {
  const fromEnv = (process.env.SITE_URL || process.env.PUBLIC_ORIGIN || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const fromFwd = protoFromForwardedHeader(request);
  let rawProto =
    fromFwd ||
    request.headers['x-forwarded-proto'] ||
    request.protocol ||
    'http';
  rawProto = String(Array.isArray(rawProto) ? rawProto[0] : rawProto)
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (rawProto === '' || rawProto === 'http') {
    if (inferHttpsFromProxyHints(request)) {
      rawProto = 'https';
    }
  }
  const proto = rawProto === 'https' ? 'https' : 'http';
  const rawHost = request.headers['x-forwarded-host'] || request.headers.host || '';
  const host = String(Array.isArray(rawHost) ? rawHost[0] : rawHost)
    .split(',')[0]
    .trim();
  if (host) {
    let p = proto === 'https' ? 'https' : 'http';
    const hostOnly = host.split(':')[0].toLowerCase();
    const corsCanon = corsHttpsCanonicalHost();
    if (p === 'http' && corsCanon && hostOnly === corsCanon) {
      p = 'https';
    }
    if (
      p === 'http' &&
      (process.env.FORCE_HTTPS_PUBLIC_ORIGIN || '').trim() === '1' &&
      !isLocalDevHost(hostOnly)
    ) {
      p = 'https';
    }
    return `${p}://${host}`;
  }
  return 'http://127.0.0.1:4000';
}

/**
 * Détection heuristique des crawlers d’aperçu (tests / outillage ; la route /v ne s’en sert plus).
 *
 * @param {string | undefined} userAgent
 * @returns {boolean}
 */
export function isLinkPreviewBot(userAgent) {
  const ua = String(userAgent || '');
  // Ne pas matcher « Instagram » / « WhatsApp » seuls : ce sont aussi les WebViews in-app (humains).
  return /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterestbot|vkshare|embedly|outbrain|flipboard|tumblr|skypeuripreview|Applebot|bingpreview|MicrosoftTeams|Snap URL Preview/i.test(
    ua
  );
}

/**
 * URL de vignette pour og:image / twitter:image (même domaine que le site ; Meta gère mal i.ytimg.com seul).
 * @param {string} origin
 * @param {string} videoId
 * @returns {string}
 */
export function shareOgThumbUrl(origin, videoId) {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/share-thumb/${encodeURIComponent(videoId)}.jpg`;
}

/**
 * URL de l’app pour ouvrir la vidéo (SPA).
 * @param {string} origin
 * @param {string} videoId
 * @returns {string}
 */
/**
 * WebView Meta (Messenger, app Facebook) : préférer #v= si la query est perdue après 302.
 * @param {string | undefined} userAgent
 * @returns {boolean}
 */
export function isMetaInAppBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (isLinkPreviewBot(ua)) return false;
  return /FBAN|FBAV|FB_IAB|Messenger/i.test(ua);
}

/**
 * @param {string} origin
 * @param {string} videoId
 * @param {{ useHash?: boolean }} [opts]
 * @returns {string}
 */
export function shareAppDeepLinkUrl(origin, videoId, opts = {}) {
  const base = String(origin || '').replace(/\/$/, '');
  if (opts.useHash) {
    return `${base}/#v=${encodeURIComponent(videoId)}`;
  }
  return `${base}/?v=${encodeURIComponent(videoId)}`;
}

/**
 * Les humains (navigateurs) sont redirigés ; les bots d’aperçu reçoivent le HTML OG.
 * @param {string | undefined} userAgent
 * @returns {boolean}
 */
export function shouldRedirectShareVisitor(userAgent) {
  return !isLinkPreviewBot(userAgent);
}

/**
 * @param {{ origin: string; videoId: string; title: string; imageWidth?: number; imageHeight?: number }} opts
 * @returns {string}
 */
export function renderSharePageHtml({
  origin,
  videoId,
  title,
  imageWidth = 1280,
  imageHeight = 720
}) {
  const safeTitle = escapeHtmlAttr(title);
  const sharePath = `/v/${encodeURIComponent(videoId)}`;
  const shareUrl = `${origin}${sharePath}`;
  const appUrl = `${origin}/?v=${encodeURIComponent(videoId)}`;
  const thumbUrl = shareOgThumbUrl(origin, videoId);
  const desc = escapeHtmlAttr('Ouvrir dans YT Ripper Web');
  const imgW = Math.max(1, Math.round(Number(imageWidth) || 1280));
  const imgH = Math.max(1, Math.round(Number(imageHeight) || 720));

  const fbId = (process.env.FB_APP_ID || process.env.META_FB_APP_ID || '').trim();
  const fbAppMeta =
    /^[0-9]+$/.test(fbId) ?
      `  <meta property="fb:app_id" content="${escapeHtmlAttr(fbId)}" />\n`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
${fbAppMeta}  <link rel="canonical" href="${escapeHtmlAttr(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${escapeHtmlAttr(shareUrl)}" />
  <meta property="og:image" content="${escapeHtmlAttr(thumbUrl)}" />
  <meta property="og:image:secure_url" content="${escapeHtmlAttr(thumbUrl)}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="${imgW}" />
  <meta property="og:image:height" content="${imgH}" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta property="og:site_name" content="YT Ripper Web" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${escapeHtmlAttr(thumbUrl)}" />
</head>
<body>
  <p style="max-width:${imgW}px;margin:0 auto"><img src="${escapeHtmlAttr(thumbUrl)}" width="${imgW}" height="${imgH}" alt="${safeTitle}" loading="eager" decoding="async" /></p>
  <p><a href="${escapeHtmlAttr(appUrl)}">Ouvrir la vidéo dans YT Ripper</a></p>
</body>
</html>`;
}
