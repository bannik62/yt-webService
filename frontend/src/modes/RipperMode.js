import { $ } from '../utils/dom.js';
import { RipperView } from '../views/RipperView.js';
import { downloadFiles } from '../utils/fileDownloader.js';

/**
 * Mode Ripper : URL directe → Téléchargement immédiat
 */
export class RipperMode {
  constructor(apiClient) {
    this.api = apiClient;
    this.ripperView = new RipperView(this.api);
    
    this.init();
  }

  init() {
    // Callback fin de téléchargement Ripper
    this.ripperView.onJobComplete = (data) => {
      this._handleJobComplete(data);
    };
  }

  async _handleJobComplete(data) {
    if (data.success && data.files) {
      // Télécharger avec sélection de dossier optionnelle
      const result = await downloadFiles(data.files, 2000);
      
      if (result.success) {
        const message = result.method === 'filesystem' 
          ? `✅ ${data.files.length} fichier(s) téléchargé(s) dans le dossier choisi !`
          : `✅ ${data.files.length} téléchargement(s) démarré(s) !`;
        alert(message);
      } else if (result.cancelled) {
        alert('❌ Téléchargement annulé.');
      }
    } else {
      alert(`❌ Erreur : ${data.error || 'Échec du téléchargement'}`);
    }
  }

  show() {
    const ripperContainer = $('#ripper-container');
    const sidebar = $('#download-list');
    
    if (ripperContainer) {
      ripperContainer.hidden = false;
      console.log('[RipperMode] Container affiché');
    }
    if (sidebar) {
      sidebar.hidden = true; // Cacher la sidebar en mode Ripper
    }
  }

  hide() {
    const ripperContainer = $('#ripper-container');
    if (ripperContainer) {
      ripperContainer.hidden = true;
      console.log('[RipperMode] Container caché');
    }
  }
}
