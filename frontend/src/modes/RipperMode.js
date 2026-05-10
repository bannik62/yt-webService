import { $ } from '../utils/dom.js';
import { RipperView } from '../views/RipperView.js';

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

  _handleJobComplete(data) {
    if (data.success && data.files) {
      // Télécharger automatiquement chaque fichier avec un délai de 2 secondes
      data.files.forEach((file, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = file.url;
          link.download = file.name;
          link.click();
          console.log(`[Ripper] Téléchargement démarré: ${file.name}`);
        }, index * 2000);
      });
      
      // Message de confirmation après tous les téléchargements
      setTimeout(() => {
        alert(`✅ ${data.files.length} téléchargement(s) démarré(s) !`);
      }, data.files.length * 2000 + 500);
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
