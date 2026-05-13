/**
 * Un seul téléchargement actif à la fois (batch recherche ou ripper).
 * Évite les courses entre modes et les doubles lancements.
 */
let locked = false;

export function tryAcquireUserDownload() {
  if (locked) return false;
  locked = true;
  return true;
}

export function releaseUserDownload() {
  locked = false;
}

export function isUserDownloadLocked() {
  return locked;
}
