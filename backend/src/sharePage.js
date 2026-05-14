/**
 * Page HTML minimale pour partage (Open Graph + redirection vers l’app).
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
 * URL publique du site (OG, canonical). Préfère SITE_URL puis en-têtes reverse-proxy.
 * @param {import('fastify').FastifyRequest} request
 * @returns {string}
 */
export function buildPublicOrigin(request) {
  const fromEnv = (process.env.SITE_URL || process.env.PUBLIC_ORIGIN || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const rawProto = request.headers['x-forwarded-proto'] || request.protocol || 'http';
  const proto = String(Array.isArray(rawProto) ? rawProto[0] : rawProto)
    .split(',')[0]
    .trim();
  const rawHost = request.headers['x-forwarded-host'] || request.headers.host || '';
  const host = String(Array.isArray(rawHost) ? rawHost[0] : rawHost)
    .split(',')[0]
    .trim();
  if (host) {
    const p = proto === 'https' ? 'https' : 'http';
    return `${p}://${host}`;
  }
  return 'http://127.0.0.1:4000';
}

/**
 * User-agents connus pour les aperçus de liens (Meta, X, Slack, etc.).
 * Ne pas leur envoyer de redirection JS : certains exécutent le script et perdent les OG.
 *
 * @param {string | undefined} userAgent
 * @returns {boolean}
 */
export function isLinkPreviewBot(userAgent) {
  const ua = String(userAgent || '');
  // Ne pas matcher « Instagram » / « WhatsApp » seuls : ce sont aussi les WebViews in-app (humains).
  return /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterestbot|vkshare|embedly|outbrain|flipboard|tumblr|skypeuripreview|Applebot|bingpreview|MicrosoftTeams/i.test(
    ua
  );
}

/**
 * @param {{ origin: string; videoId: string; title: string; autoRedirect?: boolean }} opts
 * @returns {string}
 */
export function renderSharePageHtml({ origin, videoId, title, autoRedirect = true }) {
  const safeTitle = escapeHtmlAttr(title);
  const sharePath = `/v/${encodeURIComponent(videoId)}`;
  const shareUrl = `${origin}${sharePath}`;
  const appUrl = `${origin}/?v=${encodeURIComponent(videoId)}`;
  const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
  const desc = escapeHtmlAttr('Ouvrir dans YT Ripper Web');
  /** JSON pour injecter l’URL dans un script sans risque de cassure / XSS. */
  const appUrlJs = JSON.stringify(appUrl);

  const redirectScript = autoRedirect
    ? `<script>(function(){var u=${appUrlJs};window.location.replace(u);})();</script>`
    : '';

  // Pas de <meta http-equiv="refresh"> : le crawler Meta peut suivre `/?v=` et lire les OG du SPA.
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="canonical" href="${escapeHtmlAttr(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${escapeHtmlAttr(shareUrl)}" />
  <meta property="og:image" content="${escapeHtmlAttr(thumbUrl)}" />
  <meta property="og:image:secure_url" content="${escapeHtmlAttr(thumbUrl)}" />
  <meta property="og:image:width" content="480" />
  <meta property="og:image:height" content="360" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${escapeHtmlAttr(thumbUrl)}" />
</head>
<body>
  <p><a href="${escapeHtmlAttr(appUrl)}">Ouvrir la vidéo dans YT Ripper</a></p>
  <noscript><p><a href="${escapeHtmlAttr(appUrl)}">Continuer (JavaScript désactivé)</a></p></noscript>
  ${redirectScript}
</body>
</html>`;
}
