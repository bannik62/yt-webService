import { $ } from '../utils/dom.js';
import { SearchView } from '../views/SearchView.js';
import { DownloadListView } from '../views/DownloadListView.js';
import { VideoModal } from '../views/VideoModal.js';
import { TrendingModal } from '../views/TrendingModal.js';
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
    this.trendingModal = new TrendingModal();

    this.currentJobId = null;
    this.eventSource = null;

    /** Scroll infini tendances : nouveau tirage serveur à chaque page */
    this.trendingFeedActive = false;
    this.trendingMusicOnly = false;
    this.trendingLoadingMore = false;
    /** @type {Set<string>} */
    this.seenTrendingIds = new Set();
    /** @type {string[]} */
    this.trendingKeywordsShown = [];
    /** @type {(() => void) | null} */
    this._onTrendingScroll = null;
    /** Après un lot sans nouveauté, attend un peu de scroll vers le haut avant de redemander */
    this._trendingAwaitingScrollUp = false;

    this.init();
  }

  init() {
    // Bouton tendances
    const trendingBtn = $('#trending-btn');
    if (trendingBtn) {
      trendingBtn.addEventListener('click', () => this.showTrendingModal());
    }
    
    this.trendingModal.onConfirm = (musicOnly) => {
      this.loadTrending(musicOnly);
    };

    this.searchView.onBeforeSearch = () => this.stopTrendingInfiniteScroll();

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
    
    // Clic "Lire la playlist"
    this.downloadListView.onPlay = (items) => {
      if (items.length > 0) {
        this.videoModal.show(items[0], items, 0);
      }
    };
    
    // Clic "Télécharger la playlist" → Batch download
    this.downloadListView.onDownload = (urls) => {
      this.handleBatchDownload(urls);
    };
  }

  showTrendingModal() {
    this.trendingModal.show();
  }

  async loadTrending(musicOnly = false) {
    this.stopTrendingInfiniteScroll();

    const hint = musicOnly ? '🎵 Chargement…' : '🔥 Chargement…';
    this.searchView.setHint(hint, false);
    this.searchView.results.innerHTML = '';
    this.seenTrendingIds.clear();
    this.trendingKeywordsShown = [];
    this.trendingMusicOnly = musicOnly;
    this.trendingFeedActive = true;
    this._trendingAwaitingScrollUp = false;

    try {
      const data = await this.api.getTrending(20, musicOnly);
      const items = data.items ?? [];
      const keyword = data.keyword ?? '';

      if (items.length === 0) {
        this.trendingFeedActive = false;
        this.searchView.setHint('Aucun résultat.', false);
        return;
      }

      for (const i of items) {
        if (i.id) this.seenTrendingIds.add(i.id);
      }
      if (keyword) this.trendingKeywordsShown.push(keyword);

      this.searchView.setHint(this._trendingHintText(musicOnly), false);
      this.searchView.renderResults(items);
      this.startTrendingInfiniteScroll();
    } catch (err) {
      this.trendingFeedActive = false;
      this.searchView.setHint(err.message || 'Erreur lors du chargement', true);
    }
  }

  _trendingHintText(musicOnly) {
    const themes = this.trendingKeywordsShown;
    if (themes.length === 0) return '';
    const prefix = musicOnly ? '🎵' : '🔥';
    const last = themes[themes.length - 1];
    if (themes.length === 1) {
      return `${prefix} « ${last} » — descendez pour d’autres idées`;
    }
    return `${prefix} ${themes.length} thèmes — dernier : « ${last} » (scroll pour plus)`;
  }

  /** Distance au bas du document (scroll fenêtre). */
  _windowScrollGapToBottom() {
    const h = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0
    );
    return h - window.scrollY - window.innerHeight;
  }

  _detachTrendingScrollListener() {
    if (this._onTrendingScroll) {
      window.removeEventListener('scroll', this._onTrendingScroll);
    }
    this._onTrendingScroll = null;
    this.searchView.setTrendingLoadingMore(false);
    this.trendingLoadingMore = false;
  }

  startTrendingInfiniteScroll() {
    if (!this.trendingFeedActive) return;
    this._detachTrendingScrollListener();

    this._onTrendingScroll = () => {
      if (!this.trendingFeedActive || this.trendingLoadingMore) return;
      const gap = this._windowScrollGapToBottom();
      if (gap > 220) {
        this._trendingAwaitingScrollUp = false;
      }
      if (this._trendingAwaitingScrollUp) return;
      if (gap < 140) {
        this.loadMoreTrending();
      }
    };

    window.addEventListener('scroll', this._onTrendingScroll, {
      passive: true
    });

    // Si la page est déjà courte (pas de scrollbar), charger la suite tout de suite
    this._maybeAutoLoadMoreTrending();
  }

  /**
   * Enchaîne un lot tant que le bas de page est visible sans scroll (évite blocage si peu de cartes).
   */
  _maybeAutoLoadMoreTrending() {
    requestAnimationFrame(() => {
      if (
        !this.trendingFeedActive ||
        this.trendingLoadingMore ||
        this._trendingAwaitingScrollUp
      ) {
        return;
      }
      if (this._windowScrollGapToBottom() < 40) {
        this.loadMoreTrending();
      }
    });
  }

  stopTrendingInfiniteScroll() {
    this._detachTrendingScrollListener();
    this.trendingFeedActive = false;
  }

  async loadMoreTrending() {
    if (!this.trendingFeedActive || this.trendingLoadingMore) return;
    this.trendingLoadingMore = true;
    this.searchView.setTrendingLoadingMore(true);

    try {
      const data = await this.api.getTrending(20, this.trendingMusicOnly);
      const raw = data.items ?? [];
      const keyword = data.keyword ?? '';

      const newItems = raw.filter((i) => i.id && !this.seenTrendingIds.has(i.id));
      for (const i of newItems) this.seenTrendingIds.add(i.id);

      if (keyword) this.trendingKeywordsShown.push(keyword);

      this.searchView.appendResults(newItems);
      this.searchView.setHint(
        this._trendingHintText(this.trendingMusicOnly),
        false
      );
      if (newItems.length === 0) {
        this._trendingAwaitingScrollUp = true;
      }
    } catch (err) {
      this.searchView.setHint(
        err.message || 'Erreur chargement (scroll)',
        true
      );
    } finally {
      this.trendingLoadingMore = false;
      this.searchView.setTrendingLoadingMore(false);
      this._maybeAutoLoadMoreTrending();
    }
  }

  async handleBatchDownload(urls) {
    if (urls.length === 0) {
      alert('Aucune vidéo dans la liste');
      return;
    }

    this.downloadListView.setLoading(true);

    try {
      const data = await this.api.startBatchDownload(urls);
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
    
    this.eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      if (data.status === 'queued') {
        const eta =
          data.estimatedSeconds != null
            ? ` · ~${data.estimatedSeconds}s`
            : '';
        this.downloadListView.setQueueWaitMessage(
          `⏳ En file d'attente — position ${data.position}/${data.queueLength}${eta}`
        );
      } else if (data.status === 'awaiting_local_worker') {
        this.downloadListView.setQueueWaitMessage(
          'Préparation côté navigateur… Tu peux laisser cette page ouverte.'
        );
      } else {
        this.downloadListView.clearQueueWaitMessage();
      }
    });

    // Écouter la progression pour mettre à jour les barres
    this.eventSource.addEventListener('progress', (e) => {
      this.downloadListView.clearQueueWaitMessage();
      const data = JSON.parse(e.data);
      this._handleProgress(data);
    });
    
    this.eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      this._handleJobComplete(data);
    });
    
    this.eventSource.addEventListener('error', () => {
      this.downloadListView.clearQueueWaitMessage();
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
    this.downloadListView.clearQueueWaitMessage();
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
    this.stopTrendingInfiniteScroll();
  }
}
