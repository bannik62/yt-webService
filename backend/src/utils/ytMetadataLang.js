/**
 * Langue des métadonnées YouTube (titres / chaîne affichés par yt-dlp).
 * Sans cela, InnerTube renvoie souvent l’anglais par défaut.
 *
 * Variable d’environnement : `YT_METADATA_LANG` (code court type `fr`, `en`, `de`).
 *
 * @returns {string}
 */
export function getYtMetadataLang() {
  const raw = (process.env.YT_METADATA_LANG || 'fr').trim().toLowerCase();
  return raw || 'fr';
}

/**
 * Valeur pour `--extractor-args` / option youtube-dl-exec `extractorArgs`.
 * @returns {string}
 */
export function youtubeLangExtractorArg() {
  return `youtube:lang=${getYtMetadataLang()}`;
}

/**
 * En-tête `Accept-Language` cohérent avec {@link getYtMetadataLang} pour les requêtes HTML YouTube.
 * @returns {string}
 */
export function getYtAcceptLanguageHeader() {
  const lang = getYtMetadataLang();
  if (lang === 'en' || lang.startsWith('en-')) {
    return 'en-US,en;q=0.9';
  }
  if (lang === 'fr' || lang.startsWith('fr')) {
    return 'fr-FR,fr;q=0.9,en;q=0.5';
  }
  return `${lang};q=0.9,en;q=0.5`;
}
