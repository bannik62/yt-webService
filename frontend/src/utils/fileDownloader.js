/**
 * Vérifie si l'API File System Access est supportée
 */
export function isFileSystemAccessSupported() {
  return 'showDirectoryPicker' in window;
}

/**
 * Télécharge un fichier depuis une URL
 * @param {string} url - URL du fichier
 * @returns {Promise<Blob>}
 */
async function fetchFileAsBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erreur téléchargement: ${response.status}`);
  }
  return await response.blob();
}

/**
 * Télécharge un fichier dans un dossier choisi par l'utilisateur
 * @param {string} url - URL du fichier
 * @param {string} filename - Nom du fichier
 * @param {FileSystemDirectoryHandle} dirHandle - Handle du dossier
 */
async function downloadToDirectory(url, filename, dirHandle) {
  const blob = await fetchFileAsBlob(url);
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Télécharge un fichier de manière classique (via <a> tag)
 * @param {string} url - URL du fichier
 * @param {string} filename - Nom du fichier
 */
function downloadClassic(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

/**
 * Télécharge plusieurs fichiers avec sélection de dossier optionnelle
 * @param {Array<{url: string, name: string}>} files - Liste des fichiers à télécharger
 * @param {number} delay - Délai entre chaque téléchargement en ms (défaut: 2000)
 */
export async function downloadFiles(files, delay = 2000) {
  if (files.length === 0) return;

  // Demander à l'utilisateur s'il veut choisir un dossier
  const useCustomFolder = isFileSystemAccessSupported() 
    ? confirm(`${files.length} fichier(s) à télécharger.\n\n📁 Voulez-vous choisir un dossier de destination ?\n\n✅ Oui = Choisir le dossier\n❌ Non = Dossier Téléchargements par défaut`)
    : false;

  if (useCustomFolder) {
    try {
      // Ouvrir le sélecteur de dossier
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });

      // Télécharger tous les fichiers dans le dossier choisi
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          console.log(`[Download] ${i + 1}/${files.length}: ${file.name}`);
          await downloadToDirectory(file.url, file.name, dirHandle);
          
          // Délai entre chaque fichier (sauf le dernier)
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (err) {
          console.error(`[Download] Erreur ${file.name}:`, err);
          alert(`❌ Erreur lors du téléchargement de ${file.name}\n\n${err.message}`);
        }
      }

      return { success: true, method: 'filesystem' };
    } catch (err) {
      // Utilisateur a annulé ou erreur
      if (err.name === 'AbortError') {
        console.log('[Download] Sélection de dossier annulée');
        return { success: false, cancelled: true };
      }
      console.error('[Download] Erreur File System Access:', err);
      alert(`❌ Impossible d'accéder au dossier.\n\nUtilisation du téléchargement classique...`);
      // Fallback sur téléchargement classique
    }
  }

  // Téléchargement classique (dossier par défaut du navigateur)
  console.log('[Download] Téléchargement classique');
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setTimeout(() => {
      downloadClassic(file.url, file.name);
      console.log(`[Download] ${i + 1}/${files.length}: ${file.name}`);
    }, i * delay);
  }

  return { success: true, method: 'classic' };
}
