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
      // Télécharger automatiquement chaque fichier (simple et direct)
      data.files.forEach((file, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = file.url;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          console.log(`[Ripper] Téléchargement: ${file.name}`);
        }, index * 2000);
      });
    } else {
      alert(`❌ Erreur : ${data.error || 'Échec du téléchargement'}`);
    }
  }

  show() {
    const sidebar = $('#download-list');

    if (sidebar) {
      sidebar.hidden = true;
    }
  }

  hide() {
    // La visibilité du conteneur ripper est gérée par main.js (transition).
  }
}
