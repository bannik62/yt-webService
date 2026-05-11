import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, '..', '..', 'cookies.txt');

/**
 * Retourne le chemin des cookies si le fichier existe, sinon null
 * @returns {string|null}
 */
export function getCookiesPath() {
  return fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : null;
}

/**
 * Vérifie si le fichier cookies existe
 * @returns {boolean}
 */
export function hasCookies() {
  return fs.existsSync(COOKIES_PATH);
}
