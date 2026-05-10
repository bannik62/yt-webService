import { $ } from './utils/dom.js';
import { ApiClient } from './api/ApiClient.js';
import { SearchView } from './views/SearchView.js';
import { DownloadListView } from './views/DownloadListView.js';
import { VideoModal } from './views/VideoModal.js';
import { DownloadList } from './models/DownloadList.js';
import { RipperView } from './views/RipperView.js';

/**
 * Application principale
 */
class App {
  constructor() {
    this.api = new ApiClient();
    this.downloadList = new DownloadList();
    this.videoModal = new VideoModal();
    
    this.searchView = new SearchView(this.api);
    this.downloadListView = new DownloadListView(this.downloadList);
    this.ripperView = new RipperView(this.api);
    
    this.init();
  }

  init() {
    // Toggle entre modes
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.switchMode(e.target.value);
        }
      });
    });
    
    // Clic sur résultat de recherche → Modal vidéo
    this.searchView.onResultClick = (item) => {
      this.videoModal.show(item);
    };
    
    // Clic "Ajouter" dans le modal → Ajoute à la liste
    this.videoModal.onAdd = (item) => {
      this.downloadListView.addItem(item);
    };
    
    // Clic "Télécharger" dans la liste → Lance download batch
    this.downloadListView.onDownload = (urls) => {
      this.handleBatchDownload(urls);
    };
    
    // Callback fin de téléchargement
    this.ripperView.onJobComplete = (data) => {
      this.downloadListView.setLoading(false);
      if (data.success) {
        setTimeout(() => {
          if (confirm('Téléchargement terminé ! Vider la liste ?')) {
            this.downloadList.clear();
          }
        }, 1000);
      }
    };
  }

  switchMode(mode) {
    const searchContainer = $('#search-container');
    const ripperContainer = $('#ripper-container');
    
    if (mode === 'search') {
      if (searchContainer) searchContainer.hidden = false;
      if (ripperContainer) ripperContainer.hidden = true;
    } else {
      if (searchContainer) searchContainer.hidden = true;
      if (ripperContainer) ripperContainer.hidden = false;
    }
  }
}

// Démarrer l'app
new App();
