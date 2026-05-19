/**
 * Navigateurs intégrés (Messenger, Instagram, Facebook…) : lecteur YouTube souvent bloqué.
 */

/**
 * @returns {boolean}
 */
export function isInAppSocialBrowser() {
  const ua = navigator.userAgent || '';
  if (/facebookexternalhit|Facebot|Snap URL Preview/i.test(ua)) return false;
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Twitter|LinkedInApp/i.test(ua);
}

/**
 * @param {string} videoId
 * @returns {string}
 */
export function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * Ouvre YouTube dans le navigateur système (meilleure compatibilité que l’iframe en WebView).
 * @param {string} videoId
 */
export function openYoutubeExternally(videoId) {
  const url = youtubeWatchUrl(videoId);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) window.location.assign(url);
}
