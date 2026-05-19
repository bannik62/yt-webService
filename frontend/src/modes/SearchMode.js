import { $ } from '../utils/dom.js';
import { SearchView } from '../views/SearchView.js';
import { DownloadListView } from '../views/DownloadListView.js';
import { VideoModal } from '../views/VideoModal.js';
import { DownloadProgressModal } from '../views/DownloadProgressModal.js';
import { DownloadList } from '../models/DownloadList.js';
import { PlaybackHistory } from '../models/PlaybackHistory.js';
import { Favorites } from '../models/Favorites.js';
import { ChannelFavorites } from '../models/ChannelFavorites.js';
import { HorizontalMediaStrip } from '../views/HorizontalMediaStrip.js';
import { ChannelFavoritesStrip } from '../views/ChannelFavoritesStrip.js';
import {
  tryAcquireUserDownload,
  releaseUserDownload
} from '../downloadGate.js';
import { getPublicShareBaseUrl } from '../config/publicSite.js';

/**
 * Mode Search : Recherche YouTube + Playlist + Batch download
 */
export class SearchMode {
  constructor(apiClient) {
    this.api = apiClient;
    this.downloadList = new DownloadList();
    this.searchView = new SearchView(this.api);
    this.downloadListView = new DownloadListView(this.downloadList);
    this.videoModal = new VideoModal(this.api);
    this.playbackHistory = new PlaybackHistory();
    this.favorites = new Favorites();
    this.channelFavorites = new ChannelFavorites();
    this.downloadProgressModal = new DownloadProgressModal();
    this.searchView.favorites = this.favorites;
    this.searchView.channelFavorites = this.channelFavorites;

    const playStripItem = (item) => {
      if (!item) return;
      const videoId = item.id || item.videoId;
      this.videoModal.show({
        ...item,
        id: videoId,
        url:
          item.url ||
          (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
      });
    };
    this.favoritesStrip = new HorizontalMediaStrip({
      sectionEl: $('#favorites-strip-section'),
      trackEl: $('#favorites-strip'),
      viewportEl: $('#favorites-strip-viewport'),
      prevBtn: $('#favorites-strip-prev'),
      nextBtn: $('#favorites-strip-next'),
      emptyEl: $('#favorites-strip-empty'),
      clearBtn: $('#favorites-clear'),
      onPlay: playStripItem,
      onClear: () => this.favorites.clear(),
      onRemove: (entry) => {
        const id = entry.videoId || entry.id;
        if (id) this.favorites.remove(String(id));
      },
    });
    this.historyStrip = new HorizontalMediaStrip({
      sectionEl: $('#history-strip-section'),
      trackEl: $('#history-strip'),
      viewportEl: $('#history-strip-viewport'),
      prevBtn: $('#history-strip-prev'),
      nextBtn: $('#history-strip-next'),
      clearBtn: $('#history-strip-clear'),
      showPlayedAt: true,
      onPlay: playStripItem,
      onClear: () => this.playbackHistory.clear(),
      onRemove: (entry) => {
        const id = entry.videoId || entry.id;
        if (id) this.playbackHistory.remove(String(id));
      },
    });
    this.channelFavoritesStrip = new ChannelFavoritesStrip({
      sectionEl: $('#channel-favorites-strip-section'),
      trackEl: $('#channel-favorites-strip'),
      viewportEl: $('#channel-favorites-strip-viewport'),
      prevBtn: $('#channel-favorites-strip-prev'),
      nextBtn: $('#channel-favorites-strip-next'),
      clearBtn: $('#channel-favorites-clear'),
      onSelect: (ch) => {
        void this.searchView.searchByChannel(ch);
      },
      onClear: () => this.channelFavorites.clear(),
    });

    const showVideo = this.videoModal.show.bind(this.videoModal);
    this.videoModal.show = (item, playlist, index) => {
      if (item) this.playbackHistory.record(item);
      showVideo(item, playlist, index);
    };
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
    /** Cible du listener scroll (window ou `.main-content` en desktop). */
    /** @type {Window | HTMLElement | null} */
    this._trendingScrollTarget = null;
    /** Après un lot sans nouveauté, attend un peu de scroll vers le haut avant de redemander */
    this._trendingAwaitingScrollUp = false;

    /** Téléchargement lancé depuis ↓ sur une carte : UI dans {@link downloadProgressModal} */
    this._cardDownloadModalActive = false;

    this.downloadProgressModal.onUserDismiss = () => {
      if (!this._cardDownloadModalActive) return;
      this._cardDownloadModalActive = false;
      this.eventSource?.close();
      releaseUserDownload();
      this.downloadListView.setLoading(false);
      this.downloadListView.clearQueueWaitMessage();
      this.downloadListView.clearAllProgress();
    };

    this.init();
  }

  /**
   * Ouvre la modal pour une vidéo identifiée par `?v=` ou après `/v/:id` → redirection.
   * @param {string} videoId
   * @returns {Promise<boolean>}
   */
  async openSharedVideoFromQuery(videoId) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return false;
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    try {
      const data = await this.api.probe({ url, noPlaylist: true });
      if (!data || data.ok !== true) return false;
      const title =
        typeof data.title === 'string' && data.title.trim()
          ? data.title.trim()
          : 'Vidéo YouTube';
      const channel =
        typeof data.channel === 'string' && data.channel.trim()
          ? data.channel.trim()
          : 'YouTube';
      const thumbDefault = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      const thumbnail =
        typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.startsWith('http')
          ? data.thumbnailUrl
          : thumbDefault;
      const duration =
        typeof data.durationLabel === 'string' && data.durationLabel.trim()
          ? data.durationLabel.trim()
          : null;
      const item = {
        id: videoId,
        title,
        url,
        channel,
        duration,
        thumbnail
      };
      this.videoModal.show(item);
      return true;
    } catch {
      this.downloadListView.showNotification(
        'Impossible d’ouvrir cette vidéo (réseau ou analyse).',
        true
      );
      return false;
    }
  }

  init() {
    // Bouton tendances
    const trendingBtn = $('#trending-btn');
    if (trendingBtn) {
      trendingBtn.addEventListener('click', () => {
        const musicOnly = $('#trending-music-only')?.checked ?? false;
        void this.loadTrending(musicOnly);
      });
    }
    this.searchView.onBeforeSearch = () => this.stopTrendingInfiniteScroll();

    // Clic résultat recherche → Modal vidéo
    this.searchView.onResultClick = (item) => {
      this.videoModal.show(item);
    };
    
    // Quick add depuis SearchView (bouton +)
    this.searchView.onQuickAdd = (item) => {
      this.downloadListView.addItem(item);
    };

    this.searchView.onQuickDownload = (item) => {
      void this.handleCardAddAndDownload(item);
    };

    this.searchView.onShareLink = (item) => {
      if (!item?.id) return;
      const link = `${getPublicShareBaseUrl()}/v/${encodeURIComponent(item.id)}`;
      const ok = () =>
        this.downloadListView.showNotification(
          '✓ Lien de partage copié (miniature dans les apps)',
          false
        );
      const fail = () =>
        this.downloadListView.showNotification(
          `Copie impossible — lien : ${link}`,
          true
        );
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(link).then(ok, fail);
      } else {
        fail();
      }
    };

    // Clic "Ajouter" dans modal → Playlist
    this.videoModal.onAdd = (item) => {
      this.downloadListView.addItem(item);
    };
    this.videoModal.favorites = this.favorites;

    // Clic "Lire la playlist"
    this.downloadListView.onPlay = (items) => {
      if (items.length > 0) {
        this.videoModal.show(items[0], items, 0);
      }
    };

    this._resultsVisible = false;
    this._searchLoading = false;

    const refreshMediaStrips = () => {
      this.favoritesStrip.render(this.favorites.getAll());
      this.historyStrip.render(this.playbackHistory.getAll());
      this.channelFavoritesStrip.render(this.channelFavorites.getAll());
      this._applyMediaStripsVisibility();
    };

    this._applyMediaStripsVisibility = () => {
      const hideHome = this._resultsVisible || this._searchLoading;
      if (hideHome) {
        if (this.favoritesStrip.sectionEl) {
          this.favoritesStrip.sectionEl.hidden = true;
        }
        if (this.historyStrip.sectionEl) {
          this.historyStrip.sectionEl.hidden = true;
        }
        if (this.channelFavoritesStrip.sectionEl) {
          this.channelFavoritesStrip.sectionEl.hidden = true;
        }
        return;
      }
      this.favoritesStrip.render(this.favorites.getAll());
      this.historyStrip.render(this.playbackHistory.getAll());
      this.channelFavoritesStrip.render(this.channelFavorites.getAll());
    };

    this.videoModal.onFavoriteChange = refreshMediaStrips;
    this.favorites.onChange(refreshMediaStrips);
    this.channelFavorites.onChange(refreshMediaStrips);
    this.playbackHistory.onChange(refreshMediaStrips);
    this.searchView.onFavoriteChange = refreshMediaStrips;
    this.searchView.onChannelFavoriteChange = refreshMediaStrips;
    this.searchView.onResultsChange = (hasResults) => {
      this._resultsVisible = hasResults;
      this._applyMediaStripsVisibility();
    };
    this.searchView.onLoadingChange = (loading) => {
      this._searchLoading = loading;
      this._applyMediaStripsVisibility();
    };
    this.searchView.onClearView = () => {
      this.stopTrendingInfiniteScroll();
      this.searchView.setLoading(false);
      this.searchView.clearChannelContext();
      this.searchView.clearResults();
      this.searchView.setHint('', false);
    };
    refreshMediaStrips();
  }

  async loadTrending(musicOnly = false) {
    this.stopTrendingInfiniteScroll();
    this.searchView.clearChannelContext();

    const hint = musicOnly ? '🎵 Chargement…' : '🔥 Chargement…';
    this.searchView.setHint(hint, false);
    this.searchView.setLoading(true, 'Chargement…');
    this.searchView.clearResults();
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
    } finally {
      this.searchView.setLoading(false);
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

  /**
   * Zone scrollable des résultats : `.main-content` (mobile et desktop).
   * Ne pas utiliser `window` : hors desktop `scrollY` reste 0 → faux « bas de page »
   * et `_maybeAutoLoadMoreTrending` enchaîne les chargements sans scroll.
   * @returns {HTMLElement | null}
   */
  _trendingScrollRootEl() {
    const main = document.querySelector('.main-content');
    return main instanceof HTMLElement ? main : null;
  }

  /** Distance au bas de la zone scrollable (fenêtre ou `.main-content`). */
  _trendingScrollGapToBottom() {
    const root = this._trendingScrollRootEl();
    if (root) {
      return root.scrollHeight - root.scrollTop - root.clientHeight;
    }
    const h = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0
    );
    return h - window.scrollY - window.innerHeight;
  }

  _detachTrendingScrollListener() {
    if (this._onTrendingScroll && this._trendingScrollTarget) {
      this._trendingScrollTarget.removeEventListener(
        'scroll',
        this._onTrendingScroll
      );
    }
    this._onTrendingScroll = null;
    this._trendingScrollTarget = null;
    this.searchView.setTrendingLoadingMore(false);
    this.trendingLoadingMore = false;
  }

  startTrendingInfiniteScroll() {
    if (!this.trendingFeedActive) return;
    this._detachTrendingScrollListener();

    this._onTrendingScroll = () => {
      if (!this.trendingFeedActive || this.trendingLoadingMore) return;
      const gap = this._trendingScrollGapToBottom();
      if (gap > 220) {
        this._trendingAwaitingScrollUp = false;
      }
      if (this._trendingAwaitingScrollUp) return;
      if (gap < 140) {
        this.loadMoreTrending();
      }
    };

    this._trendingScrollTarget = this._trendingScrollRootEl() ?? window;
    this._trendingScrollTarget.addEventListener('scroll', this._onTrendingScroll, {
      passive: true
    });

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
      if (this._trendingScrollGapToBottom() < 40) {
        this.loadMoreTrending();
      }
    });
  }

  /**
   * Après ajout de cartes tendances, rétablit le scroll vertical pour éviter
   * un saut en bas de page (souvent sur mobile / ancrage du navigateur).
   * @param {number} scrollTopBefore
   */
  _restoreScrollYAfterTrendingLayout(scrollTopBefore) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = this._trendingScrollRootEl();
        if (root) {
          const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
          const clamped = Math.min(
            Math.max(0, scrollTopBefore),
            maxScroll
          );
          root.scrollTop = clamped;
        } else {
          const h = Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0
          );
          const maxY = Math.max(0, h - window.innerHeight);
          const clamped = Math.min(Math.max(0, scrollTopBefore), maxY);
          window.scrollTo(0, clamped);
        }
        this._maybeAutoLoadMoreTrending();
      });
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

    const root = this._trendingScrollRootEl();
    let scrollTopBeforeAppend = root ? root.scrollTop : window.scrollY;

    try {
      const data = await this.api.getTrending(20, this.trendingMusicOnly);
      const raw = data.items ?? [];
      const keyword = data.keyword ?? '';

      const newItems = raw.filter((i) => i.id && !this.seenTrendingIds.has(i.id));
      for (const i of newItems) this.seenTrendingIds.add(i.id);

      if (keyword) this.trendingKeywordsShown.push(keyword);

      scrollTopBeforeAppend = root ? root.scrollTop : window.scrollY;
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
      this._restoreScrollYAfterTrendingLayout(scrollTopBeforeAppend);
    }
  }

  async handleBatchDownload(urls) {
    if (urls.length === 0) {
      alert('Aucune vidéo dans la liste');
      releaseUserDownload();
      if (this._cardDownloadModalActive) {
        this._cardDownloadModalActive = false;
        this.downloadProgressModal.close(false);
      }
      return;
    }

    this.downloadListView.setLoading(true);

    try {
      const data = await this.api.startBatchDownload(urls);
      this.currentJobId = data.jobId;
      this.connectToJobStream(data.jobId);
    } catch (err) {
      releaseUserDownload();
      if (this._cardDownloadModalActive) {
        this._cardDownloadModalActive = false;
        this.downloadProgressModal.close(false);
      }
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

  /**
   * Carte résultat ↓ : télécharge uniquement ce MP4 (sans ajouter à la playlist).
   * Progression affichée dans un modal.
   * @param {object} item
   */
  async handleCardAddAndDownload(item) {
    if (!tryAcquireUserDownload()) {
      this.downloadListView.showNotification(
        '⚠ Un téléchargement est déjà en cours. Attends la fin.',
        true
      );
      return;
    }

    this._cardDownloadModalActive = true;
    this.downloadProgressModal.show(item.title || 'Vidéo');

    await this.handleBatchDownload([item.url]);
  }

  connectToJobStream(jobId) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = this.api.streamJob(jobId);
    
    this.eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      const queueUi = this._cardDownloadModalActive
        ? {
            set: (t) => this.downloadProgressModal.setQueueStatus(t),
            clear: () => this.downloadProgressModal.clearQueueStatus()
          }
        : {
            set: (t) => this.downloadListView.setQueueWaitMessage(t),
            clear: () => this.downloadListView.clearQueueWaitMessage()
          };

      if (data.status === 'queued') {
        const eta =
          data.estimatedSeconds != null
            ? ` · ~${data.estimatedSeconds}s`
            : '';
        queueUi.set(
          `⏳ En file d'attente — position ${data.position}/${data.queueLength}${eta}`
        );
      } else if (data.status === 'awaiting_local_worker') {
        queueUi.set(
          'Préparation côté navigateur… Tu peux laisser cette page ouverte.'
        );
      } else {
        queueUi.clear();
      }
    });

    // Écouter la progression pour mettre à jour les barres
    this.eventSource.addEventListener('progress', (e) => {
      if (this._cardDownloadModalActive) {
        this.downloadProgressModal.clearQueueStatus();
      } else {
        this.downloadListView.clearQueueWaitMessage();
      }
      const data = JSON.parse(e.data);
      this._handleProgress(data);
    });
    
    this.eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      this._handleJobComplete(data);
    });
    
    this.eventSource.addEventListener('error', () => {
      this.downloadListView.clearQueueWaitMessage();
      if (this._cardDownloadModalActive) {
        this._cardDownloadModalActive = false;
        this.downloadProgressModal.close(false);
      }
      releaseUserDownload();
      this.downloadListView.setLoading(false);
      this.downloadListView.clearAllProgress();
      this.eventSource?.close();
    });
  }

  _handleProgress(data) {
    const progress = Math.round(data.filePct);

    if (this._cardDownloadModalActive) {
      this.downloadProgressModal.setProgress(progress);
      return;
    }

    const listIndex = data.itemIndex - 1;
    this.downloadListView.updateItemProgress(listIndex, progress);
  }

  _handleJobComplete(data) {
    this.eventSource?.close();
    this.downloadListView.clearQueueWaitMessage();
    releaseUserDownload();
    this.downloadListView.setLoading(false);

    const cardModal = this._cardDownloadModalActive;
    this._cardDownloadModalActive = false;

    const triggerBrowserDownloads = (files) => {
      files.forEach((file, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = file.url;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 2000);
      });
    };

    if (cardModal) {
      if (data.success && data.files) {
        this.downloadProgressModal.setProgress(100);
        this.downloadProgressModal.setQueueStatus(
          '✓ Fichier prêt — lancement du téléchargement…'
        );
        triggerBrowserDownloads(data.files);
        const delayAfterLast =
          data.files.length > 0 ? (data.files.length - 1) * 2000 + 1200 : 400;
        setTimeout(() => {
          this.downloadProgressModal.close(false);
        }, delayAfterLast);
      } else {
        this.downloadProgressModal.close(false);
        alert(`❌ Erreur : ${data.error || 'Échec du téléchargement'}`);
      }
      return;
    }

    if (data.success && data.files) {
      triggerBrowserDownloads(data.files);

      const delayAfterLast =
        data.files.length > 0 ? (data.files.length - 1) * 2000 + 800 : 0;
      setTimeout(() => {
        this.downloadListView.clearAllProgress();
      }, delayAfterLast);
    } else {
      this.downloadListView.clearAllProgress();
      alert(`❌ Erreur : ${data.error || 'Échec du téléchargement'}`);
    }
  }

  show() {
    const sidebar = $('#download-list');

    if (sidebar) sidebar.hidden = false;
  }

  hide() {
    const sidebar = $('#download-list');

    if (sidebar) sidebar.hidden = true;

    if (this._cardDownloadModalActive) {
      this._cardDownloadModalActive = false;
      releaseUserDownload();
      this.downloadListView.setLoading(false);
      this.downloadListView.clearQueueWaitMessage();
      this.downloadProgressModal.close(false);
    }

    // Fermer le modal et l'eventSource si ouverts
    this.videoModal.close();
    this.eventSource?.close();
    this.stopTrendingInfiniteScroll();
  }
}
