import { $, createElement } from '../utils/dom.js';
import { formatDuration, formatUploadDate, escapeHtml } from '../utils/formatters.js';

/**
 * Gère l'interface de recherche
 */
export class SearchView {
  constructor(apiClient) {
    this.api = apiClient;
    this.form = $('#search-form');
    this.input = $('#search-input');
    this.submitBtn = $('#search-submit-btn');
    this.clearBtn = $('#search-clear-btn');
    this.hint = $('#search-hint');
    this.channelContextBar = $('#channel-context-bar');
    this.channelFavoriteBtn = $('#channel-favorite-btn');
    this.channelFavoriteBtnLabel = $('#channel-favorite-btn-label');
    this.results = $('#search-results');
    this.loadingEl = $('#search-loading');
    this.loadingLabelEl = $('#search-loading-label');
    /** @type {((item: object) => void) | null} */
    this.onShareLink = null;
    /** @type {import('../models/Favorites.js').Favorites | null} */
    this.favorites = null;
    /** @type {import('../models/ChannelFavorites.js').ChannelFavorites | null} */
    this.channelFavorites = null;
    /** @type {(() => void) | null} */
    this.onFavoriteChange = null;
    /** @type {(() => void) | null} */
    this.onChannelFavoriteChange = null;
    /** @type {(() => void) | null} */
    this.onBeforeSearch = null;
    /** @type {object | null} */
    this._channelContext = null;
    /** @type {((hasResults: boolean) => void) | null} */
    this.onResultsChange = null;
    /** @type {((loading: boolean) => void) | null} */
    this.onLoadingChange = null;
    /** @type {(() => void) | null} */
    this.onClearView = null;

    /** @type {string} */
    this._lastHintText = '';

    /** @type {'default' | 'shorts'} */
    this._resultsLayout = 'default';

    this.init();
  }

  /** @param {'default' | 'shorts'} layout */
  setResultsLayout(layout) {
    this._resultsLayout = layout === 'shorts' ? 'shorts' : 'default';
    this.results?.classList.toggle('results--shorts', this._resultsLayout === 'shorts');
  }

  init() {
    if (!this.form) return;
    
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });

    this.clearBtn?.addEventListener('click', () => {
      this.clearChannelContext();
      this.onClearView?.();
    });

    this.channelFavoriteBtn?.addEventListener('click', () => {
      if (!this.channelFavorites || !this._channelContext) return;
      const added = this.channelFavorites.toggle(this._channelContext);
      this._syncChannelFavoriteBtn(added);
      this.onChannelFavoriteChange?.();
    });
  }

  /**
   * @param {object} ctx — channelId, channelUrl, channelName, thumbnail?
   */
  setChannelContext(ctx) {
    if (!ctx?.channelName && !ctx?.channelId && !ctx?.channelUrl) {
      this.clearChannelContext();
      return;
    }
    this._channelContext = {
      channelId: ctx.channelId ?? null,
      channelUrl: ctx.channelUrl ?? null,
      channelName: ctx.channelName || 'Chaîne',
      thumbnail: ctx.thumbnail ?? null,
    };
    if (this.channelContextBar) {
      this.channelContextBar.hidden = false;
    }
    const isFav = this.channelFavorites?.isFavorite(this._channelContext) ?? false;
    this._syncChannelFavoriteBtn(isFav);
  }

  clearChannelContext() {
    this._channelContext = null;
    if (this.channelContextBar) {
      this.channelContextBar.hidden = true;
    }
  }

  /**
   * @param {boolean} isFavorite
   */
  _syncChannelFavoriteBtn(isFavorite) {
    if (!this.channelFavoriteBtn) return;
    this.channelFavoriteBtn.classList.toggle('is-active', isFavorite);
    this.channelFavoriteBtn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    this.channelFavoriteBtn.title = isFavorite
      ? 'Retirer cette chaîne des favoris'
      : 'Ajouter cette chaîne aux favoris';
    if (this.channelFavoriteBtnLabel) {
      this.channelFavoriteBtnLabel.textContent = isFavorite
        ? 'Chaîne en favoris'
        : 'Ajouter la chaîne';
    }
  }

  async handleSearch() {
    const query = this.input?.value.trim() ?? '';
    if (!query) return;
    await this.runSearch(query);
  }

  /**
   * Vide les résultats / tendances et charge l'onglet vidéos de la chaîne.
   * @param {object} item — carte (channelId / channelUrl si dispo)
   */
  /**
   * @param {boolean} loading
   * @param {string} [label]
   */
  setLoading(loading, label = 'Chargement…') {
    if (this.loadingEl) {
      this.loadingEl.hidden = !loading;
    }
    if (this.loadingLabelEl && label) {
      this.loadingLabelEl.textContent = label;
    }
    this.onLoadingChange?.(loading);
  }

  async searchByChannel(item) {
    const channelName = this.#channelNameFromItem(item);
    if (!channelName && !item?.channelId && !item?.channelUrl) return;

    if (this.input) this.input.value = channelName || item.channelId || '';

    this.onBeforeSearch?.();
    this.setLoading(true, 'Chargement des vidéos…');
    this.clearResults();
    const label = channelName || 'cette chaîne';
    this.setHint(`Chaîne : ${label} — chargement des vidéos…`, false);

    try {
      const data = await this.api.searchChannelVideos({
        channelId: item?.channelId || undefined,
        channelUrl: item?.channelUrl || undefined,
        channelName: channelName || undefined,
      });
      const count = data.items?.length ?? 0;
      if (count === 0) {
        this.clearChannelContext();
        this.setHint(`Aucune vidéo trouvée pour ${label}.`, false);
        return;
      }
      const resolvedName =
        (typeof data.channelName === 'string' && data.channelName.trim()) ||
        channelName ||
        label;
      const first = data.items[0];
      this.setChannelContext({
        channelId:
          data.channelId || item?.channelId || first?.channelId || null,
        channelUrl:
          data.channelUrl || item?.channelUrl || first?.channelUrl || null,
        channelName: resolvedName,
        thumbnail: item?.thumbnail || first?.thumbnail || null,
      });
      this.setHint(
        `Chaîne : ${resolvedName} — ${count} vidéo${count > 1 ? 's' : ''} (jusqu’à 50, cette chaîne uniquement)`,
        false
      );
      this.renderResults(data.items);
    } catch (err) {
      this.clearChannelContext();
      const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        this.setHint('Délai dépassé — vérifie que le backend tourne.', true);
      } else {
        this.setHint(err.message || 'Impossible de charger la chaîne.', true);
      }
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * @param {string} query
   * @param {string} [hintWhileLoading]
   */
  async runSearch(query, hintWhileLoading = 'Recherche…') {
    this.onBeforeSearch?.();
    this.clearChannelContext();
    this.setLoading(true, 'Recherche…');
    this.clearResults();
    this.setHint(hintWhileLoading, false);

    try {
      const data = await this.api.search(query);
      this.setHint('', false);

      const items = data.items ?? [];
      if (items.length === 0) {
        this.setHint('Aucun résultat.', false);
        return;
      }

      this.renderResults(items);
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        this.setHint('Délai dépassé — vérifie que le backend tourne.', true);
      } else {
        this.setHint(err.message || 'Réseau ou serveur indisponible.', true);
      }
    } finally {
      this.setLoading(false);
    }
  }

  clearResults() {
    if (!this.results) return;
    this.results.innerHTML = '';
    this._syncResultsVisibility();
  }

  #channelNameFromItem(item) {
    if (item?.channelName && String(item.channelName).trim()) {
      return String(item.channelName).trim();
    }
    if (item?.channel && String(item.channel).trim() && item.channel !== '—') {
      return String(item.channel).trim();
    }
    return '';
  }

  renderResults(items) {
    if (!this.results) return;
    this.results.innerHTML = '';
    this.appendResults(items);
  }

  /**
   * Ajoute des cartes résultat sans vider la liste (ex. scroll infini tendances).
   */
  appendResults(items) {
    if (!this.results) return;

    items.forEach((item) => {
      const isShortLayout = this._resultsLayout === 'shorts' || item.isShort;
      const li = createElement('li', {
        className: isShortLayout ? 'result result--short' : 'result',
        'data-video-id': item.id || '',
      });

      const rawChannel =
        item.channel && String(item.channel).trim() ? String(item.channel).trim() : '';
      const channelName = rawChannel && rawChannel !== '—' ? rawChannel : '';

      if (item.thumbnail) {
        const thumbWrap = createElement('div', { className: 'result-thumb-wrap' });
        thumbWrap.appendChild(
          createElement('img', {
            src: item.thumbnail,
            alt: escapeHtml(item.title),
            className: 'result-thumb',
            loading: 'lazy',
          })
        );

        const videoId = item.id || '';
        const isFav = videoId && this.favorites?.isFavorite(videoId);
        const favBtn = createElement('button', {
          type: 'button',
          className: `favorite-star-btn${isFav ? ' is-active' : ''}`,
          title: isFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
          'aria-label': isFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
          'aria-pressed': isFav ? 'true' : 'false',
        });
        favBtn.textContent = '★';
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!this.favorites) return;
          const added = this.favorites.toggle(item);
          favBtn.classList.toggle('is-active', added);
          favBtn.setAttribute('aria-pressed', added ? 'true' : 'false');
          favBtn.title = added ? 'Retirer des favoris' : 'Ajouter aux favoris';
          favBtn.setAttribute(
            'aria-label',
            added ? 'Retirer des favoris' : 'Ajouter aux favoris'
          );
          this.onFavoriteChange?.();
        });
        thumbWrap.appendChild(favBtn);

        if (channelName) {
          const channelBtn = createElement(
            'button',
            {
              type: 'button',
              className: 'result-channel-badge',
              title: `Voir les vidéos de ${channelName}`,
              'aria-label': `Rechercher les vidéos de ${channelName}`,
            },
            escapeHtml(channelName)
          );
          channelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void this.searchByChannel(item);
          });
          thumbWrap.appendChild(channelBtn);
        }

        li.appendChild(thumbWrap);
      }

      const content = createElement('div', { className: 'result-content' });

      const title = createElement(
        'div',
        { className: 'result-title' },
        escapeHtml(item.title)
      );

      const metaParts = [formatDuration(item.duration)];
      const uploadedLabel = formatUploadDate(item.uploadedAt);
      if (uploadedLabel) metaParts.push(uploadedLabel);
      const meta = createElement('div', { className: 'result-meta' }, metaParts.join(' · '));

      content.appendChild(title);
      content.appendChild(meta);
      li.appendChild(content);

      const actions = createElement('div', { className: 'result-card-actions' });

      const downloadBtn = createElement('button', {
        type: 'button',
        className: 'quick-download-btn',
        title:
          'Télécharger cette vidéo en MP4 (fenêtre de progression, sans ajouter à la liste)',
        'aria-label': 'Télécharger cette vidéo en MP4'
      });
      downloadBtn.innerHTML = '↓';
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onQuickDownload?.(item);
      });

      const addBtn = createElement('button', {
        type: 'button',
        className: 'quick-add-btn',
        title: 'Ajouter à la liste',
        'aria-label': 'Ajouter à la liste',
        innerHTML: '+'
      });
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onQuickAdd?.(item);
      });

      const shareBtn = createElement('button', {
        type: 'button',
        className: 'quick-share-btn',
        title:
          'Copier le lien de partage (aperçu avec miniature sur WhatsApp, Discord, etc.)',
        'aria-label': 'Copier le lien de partage'
      });
      shareBtn.textContent = '⎘';
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onShareLink?.(item);
      });

      actions.appendChild(downloadBtn);
      actions.appendChild(addBtn);
      actions.appendChild(shareBtn);
      li.appendChild(actions);

      li.addEventListener('click', () => {
        this.onResultClick?.(item);
      });

      this.results.appendChild(li);
    });

    this._syncResultsVisibility();
  }

  _syncResultsVisibility() {
    if (!this.results) return;
    const hasResults = this.results.querySelector('li.result') !== null;
    this.form?.classList.toggle('search-form--has-results', hasResults);
    if (this.clearBtn) this.clearBtn.hidden = !hasResults;
    this.onResultsChange?.(hasResults);
  }

  /**
   * Indicateur discret en bas de liste pendant le chargement tendances.
   */
  setTrendingLoadingMore(loading) {
    if (!this.results) return;
    const existing = this.results.querySelector('.results-load-more');
    if (loading) {
      if (existing) return;
      const li = createElement('li', { className: 'results-load-more' }, 'Chargement…');
      this.results.appendChild(li);
    } else if (existing) {
      existing.remove();
    }
  }

  /** Petit flash blanc quand le message contexte change (recherche / tendances). */
  _flashSearchHintIfNeeded(changed) {
    if (!changed || !this.hint?.classList.contains('hint--search-context')) return;
    const el = this.hint;
    el.classList.remove('hint--context-flash');
    requestAnimationFrame(() => {
      void el.offsetWidth;
      el.classList.add('hint--context-flash');
      el.addEventListener(
        'animationend',
        () => el.classList.remove('hint--context-flash'),
        { once: true }
      );
    });
  }

  setHint(text, isError = false) {
    if (!this.hint) return;

    const next = typeof text === 'string' ? text : '';

    if (!next) {
      this.hint.hidden = true;
      this.hint.textContent = '';
      this._lastHintText = '';
      return;
    }

    const changed = next !== this._lastHintText;
    this._lastHintText = next;

    this.hint.hidden = false;
    this.hint.textContent = next;
    this.hint.classList.toggle('error', Boolean(isError));
    this._flashSearchHintIfNeeded(changed);
  }

  show() {
    const container = this.form?.parentElement;
    if (container) container.hidden = false;
  }

  hide() {
    const container = this.form?.parentElement;
    if (container) container.hidden = true;
  }
}
