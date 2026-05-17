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
    this.hint = $('#search-hint');
    this.results = $('#search-results');
    /** @type {((item: object) => void) | null} */
    this.onShareLink = null;

    /** @type {string} */
    this._lastHintText = '';

    /** @type {ReturnType<typeof setTimeout> | null} */
    this._enrichMetaTimer = null;

    this.init();
  }

  init() {
    if (!this.form) return;
    
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });
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
  async searchByChannel(item) {
    const channelName =
      item?.channel && String(item.channel).trim() && item.channel !== '—'
        ? String(item.channel).trim()
        : '';
    if (!channelName && !item?.channelId && !item?.channelUrl) return;

    if (this.input) this.input.value = channelName || item.channelId || '';

    this.onBeforeSearch?.();
    this.results.innerHTML = '';
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
        this.setHint(`Aucune vidéo trouvée pour ${label}.`, false);
        return;
      }
      this.setHint(
        `Chaîne : ${label} — ${count} vidéo${count > 1 ? 's' : ''} (uniquement cette chaîne)`,
        false
      );
      this.renderResults(data.items);
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        this.setHint('Délai dépassé — vérifie que le backend tourne.', true);
      } else {
        this.setHint(err.message || 'Impossible de charger la chaîne.', true);
      }
    }
  }

  /**
   * @param {string} query
   * @param {string} [hintWhileLoading]
   */
  async runSearch(query, hintWhileLoading = 'Recherche…') {
    this.onBeforeSearch?.();
    this.results.innerHTML = '';
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
    }
  }

  renderResults(items) {
    if (!this.results) return;
    this.results.innerHTML = '';
    this.appendResults(items);
    this.scheduleEnrichMeta();
  }

  /**
   * Ajoute des cartes résultat sans vider la liste (ex. scroll infini tendances).
   */
  appendResults(items) {
    if (!this.results) return;

    items.forEach((item) => {
      const li = createElement('li', {
        className: 'result',
        'data-video-id': item.id || '',
        'data-needs-meta': item.uploadedAt ? '0' : '1',
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

    this.scheduleEnrichMeta();
  }

  /** Enrichit les cartes sans date via /api/video/meta/batch (recherche inchangée). */
  scheduleEnrichMeta() {
    if (!this.results || !this.api?.fetchVideoMetaBatch) return;
    if (this._enrichMetaTimer) clearTimeout(this._enrichMetaTimer);
    this._enrichMetaTimer = setTimeout(() => {
      this._enrichMetaTimer = null;
      void this._runEnrichMeta();
    }, 200);
  }

  async _runEnrichMeta() {
    if (!this.results) return;

    const cards = [
      ...this.results.querySelectorAll('li.result[data-needs-meta="1"]'),
    ];
    const ids = cards
      .map((el) => el.getAttribute('data-video-id'))
      .filter((id) => id && /^[a-zA-Z0-9_-]{11}$/.test(id));

    if (ids.length === 0) return;

    const batchSize = 15;
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      try {
        const data = await this.api.fetchVideoMetaBatch(chunk);
        const items = data?.items ?? [];
        for (const meta of items) {
          this._applyMetaToCard(meta);
        }
      } catch {
        for (const id of chunk) {
          const el = this.results.querySelector(
            `li.result[data-video-id="${CSS.escape(id)}"]`
          );
          if (el) el.setAttribute('data-needs-meta', '0');
        }
      }
    }
  }

  /**
   * @param {{ id: string, uploadedAt?: string | null, duration?: number | null }} meta
   */
  _applyMetaToCard(meta) {
    if (!this.results || !meta?.id) return;
    const li = this.results.querySelector(
      `li.result[data-video-id="${CSS.escape(meta.id)}"]`
    );
    if (!li) return;

    li.setAttribute('data-needs-meta', '0');

    const metaEl = li.querySelector('.result-meta');
    if (!metaEl) return;

    const durationText =
      meta.duration != null
        ? formatDuration(meta.duration)
        : metaEl.textContent?.split(' · ')[0] || '—';
    const parts = [durationText];
    const uploadedLabel = formatUploadDate(meta.uploadedAt);
    if (uploadedLabel) parts.push(uploadedLabel);
    metaEl.textContent = parts.join(' · ');
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
