import { $ } from '../utils/dom.js';
import { SearchView } from '../views/SearchView.js';
import { DownloadListView } from '../views/DownloadListView.js';
import { SavedPlaylistsBar } from '../views/SavedPlaylistsBar.js';
import { VideoModal } from '../views/VideoModal.js';
import { DownloadProgressModal } from '../views/DownloadProgressModal.js';
import { DownloadList } from '../models/DownloadList.js';
import { PlaybackHistory } from '../models/PlaybackHistory.js';
import { Favorites } from '../models/Favorites.js';
import { ChannelFavorites } from '../models/ChannelFavorites.js';
import { HorizontalMediaStrip } from '../views/HorizontalMediaStrip.js';
import { ChannelFavoritesStrip } from '../views/ChannelFavoritesStrip.js';
import { CommunityStatsPanel } from '../views/CommunityStatsPanel.js';
import { ShortsFeedView } from '../views/ShortsFeedView.js';
import {
  tryAcquireUserDownload,
  releaseUserDownload
} from '../downloadGate.js';
import { getPublicShareBaseUrl } from '../config/publicSite.js';
import { channelLabelFromItem, validChannelLabel } from '../utils/channelLabel.js';
import { entryToPlayItem, isShortEntry } from '../utils/shortPlayback.js';

/**
 * Mode Search : Recherche YouTube + Playlist + Batch download
 */
export class SearchMode {
  constructor(apiClient) {
    this.api = apiClient;
    this.downloadList = new DownloadList();
    this.searchView = new SearchView(this.api);
    this.downloadListView = new DownloadListView(this.downloadList);
    this.savedPlaylistsBar = new SavedPlaylistsBar(this.downloadList);
    this.videoModal = new VideoModal(this.api);
    this.communityStats = new CommunityStatsPanel(this.api, {
      onPlayVideo: (entry) => this._playCommunityVideo(entry),
    });
    this.playbackHistory = new PlaybackHistory();
    this.favorites = new Favorites();
    this.channelFavorites = new ChannelFavorites();
    this.downloadProgressModal = new DownloadProgressModal();
    this.shortsFeed = new ShortsFeedView();
    this.shortsFeed.favorites = this.favorites;
    this.searchView.favorites = this.favorites;
    this.searchView.channelFavorites = this.channelFavorites;

    const playStripItem = (item) => {
      if (!item) return;
      const playItem = entryToPlayItem(item) || item;
      if (isShortEntry(playItem)) {
        void this._openShortsFeedFromLibrary(playItem);
        return;
      }
      const videoId = playItem.id || playItem.videoId;
      const channel = channelLabelFromItem(playItem);
      this.videoModal.show({
        ...playItem,
        id: videoId,
        url:
          playItem.url ||
          (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
        channel: channel || playItem.channel,
        channelName: channel || playItem.channelName || playItem.channel,
      });
    };
    const searchStripChannel = (entry) => {
      const channelName = channelLabelFromItem(entry);
      if (!channelName && !entry?.channelId && !entry?.channelUrl) return;
      void this.searchView.searchByChannel({
        channelId: entry.channelId || entry.channel_id || undefined,
        channelUrl: entry.channelUrl || entry.channel_url || undefined,
        channelName: channelName || entry.channelName || entry.channel,
        channel: channelName || entry.channel,
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
      onChannelClick: searchStripChannel,
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
      onChannelClick: searchStripChannel,
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
      onRemove: (entry) => {
        if (entry?.key) this.channelFavorites.remove(entry.key);
      },
      onClear: () => this.channelFavorites.clear(),
    });

    const showVideo = this.videoModal.show.bind(this.videoModal);
    this._onVideoPlayed = (item) => {
      if (!item) return;
      this.playbackHistory.record(item);
      this._recordCommunityViewIfReady(item);
    };
    this.videoModal.show = (item, playlist, index) => {
      this._onVideoPlayed(item);
      showVideo(item, playlist, index);
    };
    this.videoModal.onNext = (item) => this._onVideoPlayed(item);
    this.videoModal.onPrevious = (item) => this._onVideoPlayed(item);
    this.videoModal.onVideoMetaLoaded = (item, meta) => {
      const channel =
        validChannelLabel(meta?.channel) || channelLabelFromItem(item);
      if (!channel || !item) return;
      const videoId = String(item.id || item.videoId || '').trim();
      if (videoId) {
        this.favorites.patchChannel(videoId, channel);
        this.playbackHistory.patchChannel(videoId, channel);
      }
      const enriched = {
        ...item,
        channel,
        channelName: channel,
        channelId: item.channelId || item.channel_id || '',
      };
      this._recordCommunityViewIfReady(enriched);
    };
    this.videoModal.onVideoReplayed = (item) => {
      this._recordCommunityViewIfReady(item);
    };
    this.currentJobId = null;
    this.eventSource = null;

    /** Scroll infini tendances : nouveau tirage serveur à chaque page */
    this.trendingFeedActive = false;
    /** @type {'general' | 'music' | 'shorts'} */
    this.trendingMode = 'general';
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

    /** @type {object[]} */
    this._trendingItems = [];

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
   * Stats communauté : uniquement quand le nom de chaîne est connu (carte ou meta).
   * @param {object} item
   */
  _recordCommunityViewIfReady(item) {
    if (!channelLabelFromItem(item)) return;
    this.communityStats.recordVideoView(item);
  }

  /**
   * @param {{ videoId: string, title?: string, channelName?: string }} entry
   */
  _communityVideoItem(entry) {
    const videoId = String(entry?.videoId || '').trim();
    return {
      id: videoId,
      videoId,
      title: entry.title || 'Vidéo',
      channel: entry.channelName || '—',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    };
  }

  /**
   * Ouvre une vidéo depuis le classement Communauté (playlist = top affiché).
   * @param {{ videoId: string, title?: string, channelName?: string }} entry
   */
  _playCommunityVideo(entry) {
    const videoId = String(entry?.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;

    const top = this.communityStats._lastSummary?.topVideos ?? [];
    const playlist = top.map((v) => this._communityVideoItem(v));
    const idx = playlist.findIndex((p) => p.videoId === videoId);
    const item = this._communityVideoItem(entry);
    this.videoModal.playbackFromDownloadList = false;
    if (playlist.length > 1 && idx >= 0) {
      this.videoModal.show(item, playlist, idx);
    } else {
      this.videoModal.show(item);
    }
  }

  /**
   * Ouvre la modal pour une vidéo identifiée par `?v=` ou après `/v/:id` → redirection.
   * @param {string} videoId
   * @returns {Promise<boolean>}
   */
  async openSharedVideoFromQuery(videoId) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return false;
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const thumbDefault = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    this._resultsVisible = true;
    this._applyMediaStripsVisibility();

    this.videoModal.show({
      id: videoId,
      title: 'Chargement…',
      url,
      channel: 'YouTube',
      duration: null,
      thumbnail: thumbDefault,
    });

    try {
      const data = await this.api.probe({ url, noPlaylist: true });
      if (!data || data.ok !== true) {
        this.downloadListView.showNotification(
          'Impossible de récupérer les infos de la vidéo.',
          true
        );
        return false;
      }
      const title =
        typeof data.title === 'string' && data.title.trim()
          ? data.title.trim()
          : 'Vidéo YouTube';
      const channel =
        typeof data.channel === 'string' && data.channel.trim()
          ? data.channel.trim()
          : 'YouTube';
      const thumbnail =
        typeof data.thumbnailUrl === 'string' && data.thumbnailUrl.startsWith('http')
          ? data.thumbnailUrl
          : thumbDefault;
      const duration =
        typeof data.durationLabel === 'string' && data.durationLabel.trim()
          ? data.durationLabel.trim()
          : null;
      this.videoModal.updateFromItem({
        title,
        channel,
        duration,
        thumbnail,
      });
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
    const musicCb = $('#trending-music-only');
    const shortsCb = $('#trending-shorts-only');
    musicCb?.addEventListener('change', () => {
      if (musicCb.checked && shortsCb) shortsCb.checked = false;
    });
    shortsCb?.addEventListener('change', () => {
      if (shortsCb.checked && musicCb) musicCb.checked = false;
    });

    // Bouton tendances
    const trendingBtn = $('#trending-btn');
    if (trendingBtn) {
      trendingBtn.addEventListener('click', () => {
        const dots = trendingBtn.querySelector('.lucky-btn-dots');
        if (dots) {
          dots.classList.remove('lucky-btn-dots--play');
          void dots.offsetWidth;
          dots.classList.add('lucky-btn-dots--play');
        }
        void this.loadTrending(this._getTrendingMode());
      });
    }
    this.searchView.onBeforeSearch = () => this.stopTrendingInfiniteScroll();

    // Clic résultat recherche → Modal vidéo ou feed Shorts
    this.searchView.onResultClick = (item) => {
      if (this.trendingMode === 'shorts' && this.trendingFeedActive) {
        const index = this._trendingItems.findIndex((i) => i.id === item.id);
        void this._openShortsFeed(index >= 0 ? index : 0);
        return;
      }
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
        this.videoModal.playbackFromDownloadList = true;
        this.videoModal.show(items[0], items, 0);
      }
    };

    this.downloadList.onChange(() => {
      if (
        this.videoModal.playbackFromDownloadList &&
        this.videoModal.currentItem
      ) {
        const fresh = this.downloadList.getAll();
        if (fresh.length > 0) {
          this.videoModal.syncPlaylist(fresh);
        }
      }
    });

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
        this.communityStats.setHomeVisible(false);
        return;
      }
      this.favoritesStrip.render(this.favorites.getAll());
      this.historyStrip.render(this.playbackHistory.getAll());
      this.channelFavoritesStrip.render(this.channelFavorites.getAll());
      this.communityStats.setHomeVisible(true);
    };

    this.shortsFeed.onFavorite = () => {
      refreshMediaStrips();
    };
    this.shortsFeed.onDownload = (item) => {
      void this.handleCardAddAndDownload(item);
    };
    this.shortsFeed.onShare = (item) => {
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
    this.shortsFeed.onClose = () => {
      document.body.classList.remove('shorts-feed-open');
    };
    this.shortsFeed.onItemActive = (item) => {
      this._onVideoPlayed({ ...item, isShort: true });
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
      this.searchView.setResultsLayout('default');
      this.searchView.setHint('', false);
      this._trendingItems = [];
      this.trendingMode = 'general';
      this._resultsVisible = false;
      this._applyMediaStripsVisibility();
    };

    try {
      const shareV = new URLSearchParams(window.location.search).get('v');
      if (shareV && /^[a-zA-Z0-9_-]{11}$/.test(shareV)) {
        this._resultsVisible = true;
      }
    } catch {
      /* ignore */
    }
    refreshMediaStrips();
    void this.communityStats.refresh();
  }

  /** @returns {'general' | 'music' | 'shorts'} */
  _getTrendingMode() {
    if ($('#trending-shorts-only')?.checked) return 'shorts';
    if ($('#trending-music-only')?.checked) return 'music';
    return 'general';
  }

  _trendingApiOpts() {
    return {
      musicOnly: this.trendingMode === 'music',
      shortsOnly: this.trendingMode === 'shorts',
    };
  }

  /** Exclut les Shorts du feed tendances sauf en mode 📱. */
  _filterTrendingForMode(items) {
    if (this.trendingMode === 'shorts') return items;
    return items.filter((i) => !i.isShort);
  }

  async _fetchMoreTrendingItems() {
    const maxAttempts = 3;
    let batch = [];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const data = await this.api.getTrending(20, this._trendingApiOpts());
      const keyword = data.keyword ?? '';
      const raw = this._filterTrendingForMode(data.items ?? []);
      batch = raw.filter(
        (i) => i.id && !this.seenTrendingIds.has(i.id)
      );
      if (keyword) this.trendingKeywordsShown.push(keyword);
      if (batch.length > 0) break;
    }
    for (const i of batch) this.seenTrendingIds.add(i.id);
    return batch;
  }

  async _openShortsFeed(startIndex = 0) {
    this.shortsFeed.onNeedMore = async () => this._fetchMoreTrendingItems();
    await this.shortsFeed.open(this._trendingItems, startIndex);
  }

  /** Shorts depuis historique ou favoris (feed scrollable). */
  _libraryShortItems(source) {
    const raw =
      source === 'favorites'
        ? this.favorites.getAll()
        : this.playbackHistory.getAll();
    return raw.filter(isShortEntry).map((e) => entryToPlayItem(e)).filter(Boolean);
  }

  /**
   * @param {object} clicked
   */
  async _openShortsFeedFromLibrary(clicked) {
    const playItem = entryToPlayItem(clicked) || clicked;
    const videoId = String(playItem.id || playItem.videoId || '').trim();
    if (!videoId) return;

    let items = this._libraryShortItems('history');
    const favShorts = this._libraryShortItems('favorites');
    for (const f of favShorts) {
      if (!items.some((i) => i.id === f.id)) items.push(f);
    }

    let index = items.findIndex((i) => i.id === videoId);
    if (index < 0) {
      items = [{ ...playItem, isShort: true }, ...items];
      index = 0;
    }

    this.shortsFeed.onNeedMore = async () => {
      const batch = await this._fetchMoreTrendingItems();
      return batch.map((i) => ({ ...i, isShort: true }));
    };
    await this.shortsFeed.open(items, index);
  }

  async loadTrending(mode = 'general') {
    this.stopTrendingInfiniteScroll();
    this.searchView.clearChannelContext();

    this.trendingMode = mode;
    const isShorts = mode === 'shorts';
    const isMusic = mode === 'music';
    this.searchView.setResultsLayout(isShorts ? 'shorts' : 'default');

    const hint = isShorts
      ? '📱 Chargement Shorts…'
      : isMusic
        ? '🎵 Chargement…'
        : '🔥 Chargement…';
    this.searchView.setHint(hint, false);
    this.searchView.setLoading(true, 'Chargement…');
    this.searchView.clearResults();
    this.seenTrendingIds.clear();
    this.trendingKeywordsShown = [];
    this._trendingItems = [];
    this.trendingFeedActive = true;
    this._trendingAwaitingScrollUp = false;

    try {
      const data = await this.api.getTrending(20, this._trendingApiOpts());
      const items = this._filterTrendingForMode(data.items ?? []);
      const keyword = data.keyword ?? '';

      if (items.length === 0) {
        this.trendingFeedActive = false;
        this.searchView.setHint('Aucun résultat.', false);
        return;
      }

      for (const i of items) {
        if (i.id) this.seenTrendingIds.add(i.id);
      }
      this._trendingItems = [...items];
      if (keyword) this.trendingKeywordsShown.push(keyword);

      this.searchView.setHint(this._trendingHintText(), false);
      this.searchView.renderResults(items);
      this.startTrendingInfiniteScroll();
    } catch (err) {
      this.trendingFeedActive = false;
      this.searchView.setHint(err.message || 'Erreur lors du chargement', true);
    } finally {
      this.searchView.setLoading(false);
    }
  }

  _trendingHintText() {
    const themes = this.trendingKeywordsShown;
    if (themes.length === 0) return '';
    const prefix =
      this.trendingMode === 'shorts'
        ? '📱'
        : this.trendingMode === 'music'
          ? '🎵'
          : '🔥';
    const last = themes[themes.length - 1];
    if (themes.length === 1) {
      const suffix = this.trendingMode === 'shorts'
        ? ' — touchez une carte ou descendez dans le feed'
        : ' — descendez pour d’autres idées';
      return `${prefix} « ${last} »${suffix}`;
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
      const newItems = await this._fetchMoreTrendingItems();
      this._trendingItems.push(...newItems);

      scrollTopBeforeAppend = root ? root.scrollTop : window.scrollY;
      this.searchView.appendResults(newItems);
      this.searchView.setHint(this._trendingHintText(), false);
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
