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
    
    // Quick add depuis SearchView (bouton +)
    this.searchView.onQuickAdd = (item) => {
      this.downloadListView.addItem(item);
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
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(30000)  // Timeout 30 secondes
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur serveur (${response.status})`);
      }

      const data = await response.json();
      this.currentJobId = data.jobId;
      this.connectToJobStream(data.jobId);
    } catch (err) {
      // Messages d'erreur détaillés selon le type d'erreur
      let message = '❌ Erreur : ';
      
      if (err.name === 'TimeoutError') {
        message += 'Le serveur ne répond pas (timeout 30s)';
      } else if (err.name === 'TypeError' && !navigator.onLine) {
        message += 'Pas de connexion internet';
      } else if (err.name === 'TypeError') {
        message += 'Impossible de contacter le serveur';
      } else {
        message += err.message;
      }
      
      alert(message);
      this.downloadListView.setLoading(false);
    }
  }

  connectToJobStream(jobId) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = this.api.streamJob(jobId);
    
    // Écouter la progression pour mettre à jour les barres
    this.eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      this._handleProgress(data);
    });
    
    this.eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      this._handleJobComplete(data);
    });
    
    this.eventSource.addEventListener('error', () => {
      this.downloadListView.setLoading(false);
      this.downloadListView.clearAllProgress();
      this.eventSource?.close();
    });
  }

  _handleProgress(data) {
    // data = { filePct: 45, itemIndex: 2, itemTotal: 5 }
    // itemIndex est 1-based, donc -1 pour l'index array
    const listIndex = data.itemIndex - 1;
    const progress = Math.round(data.filePct);
    
    this.downloadListView.updateItemProgress(listIndex, progress);
  }

  _handleJobComplete(data) {
    this.eventSource?.close();
    this.downloadListView.setLoading(false);
    
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
        }, index * 2000);
      });
      
      // Demander si on vide la liste
      setTimeout(() => {
        this.downloadListView.clearAllProgress();
        if (confirm(`✅ ${data.files.length} téléchargement(s) terminé(s) !\n\nVider la playlist ?`)) {
          this.downloadList.clear();
        }
      }, data.files.length * 2000 + 1000);
    } else {
      this.downloadListView.clearAllProgress();
      alert(`❌ Erreur : ${data.error || 'Échec du téléchargement'}`);
    }
  }

  show() {
    const searchContainer = $('#search-container');
    const sidebar = $('#download-list');
    
    if (searchContainer) searchContainer.hidden = false;
    if (sidebar) sidebar.hidden = false;
  }

  hide() {
    const searchContainer = $('#search-container');
    const sidebar = $('#download-list');
    
    if (searchContainer) searchContainer.hidden = true;
    if (sidebar) sidebar.hidden = true;
    
    // Fermer le modal et l'eventSource si ouverts
    this.videoModal.close();
    this.eventSource?.close();
  }
}
