/** Même défaut que `vite.config.js` (meta OG / prod). */
const DEFAULT_PUBLIC_SITE = 'https://yt.codeurbase.fr';

/**
 * Origine publique du site pour les liens copiés (partage), pas l’URL du navigateur
 * (sinon en dev : 127.0.0.1:5173).
 * @returns {string} Schéma + hôte, sans slash final.
 */
export function getPublicShareBaseUrl() {
  const fromEnv = (import.meta.env.VITE_SITE_URL || '').trim();
  const base = fromEnv || DEFAULT_PUBLIC_SITE;
  return base.replace(/\/$/, '');
}
