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
    // Bouton actualiser proxy
    const refreshProxyBtn = $('#refresh-proxy-btn');
    if (refreshProxyBtn) {
      refreshProxyBtn.addEventListener('click', () => this.refreshProxy());
    }
    
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

  async refreshProxy() {
    const btn = $('#refresh-proxy-btn');
    if (!btn) return;
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ ...';
    
    try {
      const response = await fetch('/api/refresh-proxy', { method: 'POST' });
      const data = await response.json();
      
      if (data.ok) {
        btn.textContent = '✅ OK';
        alert(`✅ Proxy actualisé !\n\n${data.message}`);
      } else {
        btn.textContent = '❌ Erreur';
        alert(`❌ Erreur : ${data.error}`);
      }
    } catch (error) {
      btn.textContent = '❌ Erreur';
      alert(`❌ Impossible d'actualiser le proxy : ${error.message}`);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = originalText;
      }, 2000);
    }
  }

  async handleBatchDownload(urls) {
    if (!urls || urls.length === 0) {
      alert('Aucune URL à télécharger');
      return;
    }

    this.downloadListView.setLoading(true);
    this.ripperView.clearLogs();
    this.ripperView.setHint('Démarrage du téléchargement batch…', false);

    try {
      const result = await this.api.startBatchDownload(urls);
      this.ripperView.currentJob = result.jobId;
      this.ripperView.connectToJobStream(result.jobId);
    } catch (err) {
      this.ripperView.setHint(err.message || 'Erreur lors du lancement batch', true);
      this.downloadListView.setLoading(false);
    }
  }
}

// Démarrer l'app
new App();
