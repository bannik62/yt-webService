import { $ } from '../utils/dom.js';
import { SearchView } from '../views/SearchView.js';
import { DownloadListView } from '../views/DownloadListView.js';
import { VideoModal } from '../views/VideoModal.js';
import { DownloadList } from '../models/DownloadList.js';

/**
 * Mode Search : Recherche YouTube + Playlist + Batch download
 */
export class SearchMode {
  constructor(apiClient) {
    this.api = apiClient;
    this.downloadList = new DownloadList();
    this.searchView = new SearchView(this.api);
    this.downloadListView = new DownloadListView(this.downloadList);
    this.videoModal = new VideoModal();
    
    this.currentJobId = null;
    this.eventSource = null;
    
    this.init();
  }

  init() {
    // Clic résultat recherche → Modal vidéo
    this.searchView.onResultClick = (item) => {
      this.videoModal.show(item);
    };
    
    // Clic "Ajouter" dans modal → Playlist
    this.videoModal.onAdd = (item) => {
      this.downloadListView.addItem(item);
    };
    
    // Clic "Télécharger la playlist" → Batch download
    this.downloadListView.onDownload = (urls) => {
      this.handleBatchDownload(urls);
    };
  }

  async handleBatchDownload(urls) {
    if (urls.length === 0) {
      alert('Aucune vidéo dans la liste');
      return;
    }

    this.downloadListView.setLoading(true);

    try {
      const response = await fetch('/api/download-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.currentJobId = data.jobId;
      this.connectToJobStream(data.jobId);
    } catch (err) {
      alert(`Erreur : ${err.message}`);
      this.downloadListView.setLoading(false);
    }
  }

  connectToJobStream(jobId) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = this.api.streamJob(jobId);
    
    this.eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      this._handleJobComplete(data);
    });
    
    this.eventSource.addEventListener('error', () => {
      this.downloadListView.setLoading(false);
      this.eventSource?.close();
    });
  }

  _handleJobComplete(data) {
    this.eventSource?.close();
    this.downloadListView.setLoading(false);
    
    if (data.success && data.files) {
      // Télécharger automatiquement chaque fichier avec un délai de 2 secondes
      data.files.forEach((file, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = file.url;
          link.download = file.name;
          link.click();
        }, index * 2000);
      });
      
      // Demander si on vide la liste
      setTimeout(() => {
        if (confirm(`${data.files.length} téléchargement(s) terminé(s) !\n\nVider la playlist ?`)) {
          this.downloadList.clear();
        }
      }, data.files.length * 2000 + 1000);
    } else {
      alert(`❌ Erreur : ${data.error || 'Échec du téléchargement'}`);
    }
  }

  show() {
    const searchContainer = $('#search-container');
    const sidebar = $('#download-list-sidebar');
    
    if (searchContainer) searchContainer.hidden = false;
    if (sidebar) sidebar.hidden = false;
  }

  hide() {
    const searchContainer = $('#search-container');
    const sidebar = $('#download-list-sidebar');
    
    if (searchContainer) searchContainer.hidden = true;
    if (sidebar) sidebar.hidden = true;
    
    // Fermer le modal et l'eventSource si ouverts
    this.videoModal.hide();
    this.eventSource?.close();
  }
}
