/**
 * Nettoie les descriptions YouTube pour l’affichage in-app (sans liens boutique / affiliation).
 */

/** Hôtes souvent utilisés pour liens d’affiliation ou boutiques. */
const AFFILIATE_HOST_RE =
  /^(?:[a-z0-9-]+\.)*(?:amazon|amzn|aliexpress|alibaba|ebay|fnac|cdiscount|rakuten|etsy|shopify|awin|shareasale|banggood|gearbest|wish|temu)(?:\.[a-z]{2,})+$/i;

const SHORT_LINK_HOST_RE = /^(?:amzn\.to|bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly)$/i;

const HTTP_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** amzn.to/xxx sans schéma */
const BARE_SHORT_LINK_RE =
  /\b(?:amzn\.to|bit\.ly|t\.co|goo\.gl)\/[a-zA-Z0-9_-]+\b/gi;

/**
 * @param {string} host
 * @returns {boolean}
 */
function isAffiliateHost(host) {
  const h = host.replace(/^www\./i, '').toLowerCase();
  return AFFILIATE_HOST_RE.test(h) || SHORT_LINK_HOST_RE.test(h);
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isAffiliateOrShopUrl(url) {
  try {
    const u = new URL(url);
    return isAffiliateHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * @param {string} s
 * @returns {string}
 */
function cleanupDescriptionWhitespace(s) {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/:\s*-\s*/g, ' — ')
    .replace(/(?:^|\n)\s*:\s*/gm, '\n')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Retire les URLs d’affiliation / boutique et les raccourcis (amzn.to, etc.).
 * Les autres URLs (site perso, doc) sont conservées.
 * @param {string} text
 * @returns {string}
 */
export function stripAffiliateUrlsFromDescription(text) {
  if (text == null || typeof text !== 'string') return '';

  let s = text.replace(/\r\n/g, '\n');

  s = s.replace(HTTP_URL_RE, (match) =>
    isAffiliateOrShopUrl(match) ? '' : match
  );

  s = s.replace(BARE_SHORT_LINK_RE, '');

  return cleanupDescriptionWhitespace(s);
}

/**
 * Retire toutes les URLs http(s) — mode agressif si la description est surtout des liens.
 * @param {string} text
 * @returns {string}
 */
export function stripAllUrlsFromDescription(text) {
  if (text == null || typeof text !== 'string') return '';

  let s = text
    .replace(/\r\n/g, '\n')
    .replace(HTTP_URL_RE, '')
    .replace(BARE_SHORT_LINK_RE, '');

  return cleanupDescriptionWhitespace(s);
}

/**
 * Prépare la description pour le modal lecteur (affiliation + URLs orphelines type « : - »).
 * @param {string} raw
 * @param {{ aggressive?: boolean }} [opts]
 * @returns {string | null}
 */
export function sanitizeDescriptionForDisplay(raw, opts = {}) {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return null;

  let s = opts.aggressive
    ? stripAllUrlsFromDescription(trimmed)
    : stripAffiliateUrlsFromDescription(trimmed);

  if (!s) return null;

  const max = 10_000;
  if (s.length > max) {
    s = s.slice(0, max);
  }

  return s || null;
}
