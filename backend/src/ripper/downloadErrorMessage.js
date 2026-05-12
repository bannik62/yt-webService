import { DelegationTimedOutError } from './proxyQuotaError.js';

/**
 * Remplace les erreurs brutes youtube-dl-exec / yt-dlp par un texte lisible pour l’UI.
 * Le détail complet reste dans les logs serveur (console.error sur le job).
 * @param {unknown} err
 * @returns {string}
 */
export function formatDownloadErrorForUser(err) {
  if (
    err instanceof DelegationTimedOutError ||
    (err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code === 'WORKER_LOCAL_DELEGATION_TIMEOUT')
  ) {
    return (
      'Le téléchargement n’a pas pu être finalisé à temps depuis ton navigateur. ' +
      'Réessaie plus tard.'
    );
  }

  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw;

  if (
    /sign in to confirm|not a bot|login required|private video|video unavailable|members only/i.test(
      msg
    )
  ) {
    return (
      'YouTube refuse cette requête (vidéo privée, restreinte, ou vérification « pas un robot »). ' +
      'Réessaie plus tard ou configure des cookies sur l’API si besoin.'
    );
  }

  if (/http error 403|403 forbidden|forbidden|blocked/i.test(msg)) {
    return (
      'YouTube a refusé la connexion depuis le serveur. Sans proxy fiable, les téléchargements échouent souvent depuis un VPS. ' +
      'Ils reprendront dès qu’un proxy sera de nouveau disponible. En attendant, la recherche peut encore marcher.'
    );
  }

  if (/402|payment required|tunnel connection failed/i.test(msg)) {
    return (
      'Le proxy a refusé la connexion (quota épuisé ou paiement requis). ' +
      'Les téléchargements reprendront quand le proxy fonctionnera à nouveau ou si tu en configures un autre.'
    );
  }

  if (
    /the command spawned as:/i.test(msg) ||
    /exited with code [1-9]/i.test(msg) ||
    /stderr:\s*\n/i.test(msg) ||
    msg.length > 550
  ) {
    return (
      'Téléchargement impossible pour l’instant : le serveur n’a pas pu récupérer la vidéo (souvent pas de proxy actif ou blocage YouTube sur l’IP de l’hébergement). ' +
      'Il n’y a pas de correctif côté navigateur tout de suite : les téléchargements reviendront dès que le proxy sera rétabli ou la chaîne corrigée. Tu peux encore parcourir les résultats de recherche.'
    );
  }

  if (msg.length > 420) {
    return `${msg.slice(0, 380).trim()}…`;
  }

  return msg;
}
