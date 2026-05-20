import { $ } from '../utils/dom.js';
import { getOrCreateAnonStatsId } from '../utils/anonStatsId.js';

const EXPANDED_STORAGE_KEY = 'yt-community-stats-expanded';

/**
 * Panneau stats communautaires (agrégats anonymes), repliable via en-tête.
 */
export class CommunityStatsPanel {
  /**
   * @param {import('../api/ApiClient.js').ApiClient} api
   * @param {{ onPlayVideo?: (entry: { videoId: string, title?: string, channelName?: string }) => void }} [opts]
   */
  constructor(api, opts = {}) {
    this.api = api;
    this.onPlayVideo = opts.onPlayVideo ?? null;
    this.sectionEl = $('#community-stats-section');
    this.toggleBtn = $('#community-stats-toggle');
    this.toggleHintEl = $('#community-stats-toggle-hint');
    this.panelEl = $('#community-stats-panel');
    this.videosEl = $('#community-stats-videos');
    this.channelsEl = $('#community-stats-channels');
    this.metaEl = $('#community-stats-meta');
    this.videosMoreEl = $('#community-stats-videos-more');
    this.channelsMoreEl = $('#community-stats-channels-more');
    this.refreshBtn = $('#community-stats-refresh');
    this.displayLimit = 15;
    this._loading = false;
    this._homeVisible = true;
    this._lastSummary = null;
    this._expanded = this.#readExpandedPreference();

    this.toggleBtn?.addEventListener('click', () => {
      this.setExpanded(!this._expanded);
    });

    this.refreshBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.refresh();
    });

    this.videosEl?.addEventListener('click', (e) => {
      const btn = e.target.closest('.community-stats-play');
      if (!btn) return;
      const videoId = btn.dataset.videoId;
      const entry = this._lastSummary?.topVideos?.find((v) => v.videoId === videoId);
      if (entry) this.onPlayVideo?.(entry);
    });

    this.setExpanded(this._expanded, { persist: false });
  }

  #readExpandedPreference() {
    try {
      return localStorage.getItem(EXPANDED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  /**
   * @param {boolean} expanded
   * @param {{ persist?: boolean }} [opts]
   */
  setExpanded(expanded, opts = {}) {
    this._expanded = expanded;
    const persist = opts.persist !== false;

    if (this.sectionEl) {
      this.sectionEl.classList.toggle('is-expanded', expanded);
    }
    if (this.toggleBtn) {
      this.toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (this.panelEl) {
      this.panelEl.hidden = !expanded;
    }

    if (persist) {
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? '1' : '0');
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * @param {boolean} visible
   */
  setHomeVisible(visible) {
    this._homeVisible = visible;
    this._syncSectionVisibility();
  }

  _syncSectionVisibility() {
    if (!this.sectionEl) return;
    if (!this._homeVisible) {
      this.sectionEl.hidden = true;
      return;
    }
    const hasData =
      (this._lastSummary?.totalEvents ?? 0) > 0 ||
      (this._lastSummary?.topVideos?.length ?? 0) > 0;
    this.sectionEl.hidden = !hasData;
  }

  /**
   * @param {number} total
   * @param {number} days
   */
  _updateToggleHint(total, days) {
    if (!this.toggleHintEl) return;
    if (total > 0) {
      this.toggleHintEl.textContent = `${total} vue${total > 1 ? 's' : ''} · ${days} j`;
    } else {
      this.toggleHintEl.textContent = '';
    }
  }

  async refresh() {
    if (!this.sectionEl || this._loading) return;
    this._loading = true;
    if (this._expanded && this.metaEl) {
      this.metaEl.textContent = 'Chargement…';
    }

    try {
      const summary = await this.api.fetchUsageStatsSummary({
        days: 7,
        limit: this.displayLimit
      });
      this._lastSummary = summary;
      this.render(summary);
    } catch {
      this._lastSummary = null;
      if (this.metaEl) {
        this.metaEl.textContent = 'Stats indisponibles pour le moment.';
      }
      if (this.toggleHintEl) this.toggleHintEl.textContent = '';
      this._syncSectionVisibility();
    } finally {
      this._loading = false;
    }
  }

  /**
   * @param {{
   *   periodDays?: number,
   *   totalEvents?: number,
   *   displayLimit?: number,
   *   totalVideos?: number,
   *   videosNotShown?: number,
   *   totalChannels?: number,
   *   channelsNotShown?: number,
   *   topVideos?: Array<{ videoId: string, title: string, channelName?: string, views: number, uniqueViewers: number }>,
   *   topChannels?: Array<{ channelId: string, channelName: string, views: number, uniqueViewers: number }>
   * }} summary
   */
  render(summary) {
    if (!this.sectionEl) return;
    this._lastSummary = summary;

    const days = summary?.periodDays ?? 7;
    const total = summary?.totalEvents ?? 0;
    const limit = summary?.displayLimit ?? this.displayLimit;

    this._updateToggleHint(total, days);

    if (this.metaEl) {
      this.metaEl.textContent =
        total > 0
          ? `Stats anonymes sur ${days} jours (${total} vues · top ${limit} affiché).`
          : '';
    }

    if (total <= 0) {
      this._syncSectionVisibility();
      return;
    }
    this._syncSectionVisibility();

    this._renderMore(
      this.videosMoreEl,
      summary?.videosNotShown ?? 0,
      summary?.totalVideos ?? 0,
      'vidéo',
      'vidéos'
    );
    this._renderMore(
      this.channelsMoreEl,
      summary?.channelsNotShown ?? 0,
      summary?.totalChannels ?? 0,
      'chaîne',
      'chaînes'
    );

    this._renderList(
      this.videosEl,
      summary?.topVideos ?? [],
      (item, i) =>
        `<li><span class="community-stats-rank">${i + 1}</span>` +
        `<button type="button" class="community-stats-play community-stats-label" data-video-id="${escapeHtml(item.videoId)}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</button>` +
        `<span class="community-stats-count">${item.views} vues · ${item.uniqueViewers} pers.</span></li>`
    );

    this._renderList(
      this.channelsEl,
      summary?.topChannels ?? [],
      (item, i) =>
        `<li><span class="community-stats-rank">${i + 1}</span>` +
        `<span class="community-stats-label" title="${escapeHtml(item.channelName)}">${escapeHtml(item.channelName)}</span>` +
        `<span class="community-stats-count">${item.views} vues · ${item.uniqueViewers} pers.</span></li>`
    );
  }

  /**
   * @param {HTMLElement | null} el
   * @param {number} notShown
   * @param {number} total
   * @param {string} singular
   * @param {string} plural
   */
  _renderMore(el, notShown, total, singular, plural) {
    if (!el) return;
    if (notShown <= 0) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    const word = notShown === 1 ? singular : plural;
    el.textContent = `+ ${notShown} autre${notShown > 1 ? 's' : ''} ${word} non affichée${notShown > 1 ? 's' : ''} (${total} au total sur la période).`;
  }

  /**
   * @param {HTMLElement | null} el
   * @param {Array<object>} items
   * @param {(item: object, index: number) => string} rowHtml
   */
  _renderList(el, items, rowHtml) {
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<li class="community-stats-empty">—</li>';
      return;
    }
    el.innerHTML = items.map((item, i) => rowHtml(item, i)).join('');
  }

  /**
   * Envoie une vue vidéo (silencieux en cas d’erreur).
   * @param {object} item
   */
  recordVideoView(item) {
    const videoId = String(item?.id || item?.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;

    void this.api
      .recordUsageEvent({
        type: 'video_view',
        anonId: getOrCreateAnonStatsId(),
        videoId,
        channelId: item?.channelId || item?.channel_id || '',
        channelName: item?.channel || item?.channelName || item?.uploader || '',
        title: item?.title || ''
      })
      .then((res) => {
        if (res?.recorded) {
          void this.refresh();
        }
      })
      .catch(() => {});
  }
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
