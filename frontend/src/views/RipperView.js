import { $, createElement } from '../utils/dom.js';

/**
 * Gère l'interface ripper (URL → MP3)
 */
export class RipperView {
  constructor(apiClient) {
    this.api = apiClient;
    this.form = $('#ripper-form');
    this.urlInput = $('#ripper-url');
    this.modeRadios = document.getElementsByName('ripper-mode');
    this.maxInput = $('#ripper-max');
    this.maxContainer = $('#ripper-max-container');
    this.probeBtn = $('#ripper-probe');
    this.downloadBtn = $('#ripper-download');
    this.hint = $('#ripper-hint');
    this.progress = $('#ripper-progress');
    this.logs = $('#ripper-logs');
    
    this.currentJob = null;
    this.eventSource = null;

    /** @type {number | null} */
    this._progressRaf = null;
    /** @type {{ overall: number, filePct: number, itemIndex: number, itemTotal: number } | null} */
    this._progressTarget = null;
    /** @type {{ overall: number, filePct: number } | null} */
    this._progressShown = null;
    /** @type {Record<string, HTMLElement | null> | null} */
    this._progressDom = null;

    this.init();
  }

  init() {
    if (!this.form) return;
    
    // Toggle max tracks selon mode
    this.modeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const isPlaylist = radio.value === 'playlist';
        if (this.maxContainer) {
          this.maxContainer.hidden = !isPlaylist;
        }
        this.setHint('', false);
      });
    });
    
    this.probeBtn?.addEventListener('click', () => this.handleProbe());
    this.downloadBtn?.addEventListener('click', () => this.handleDownload());
  }

  getMode() {
    for (const radio of this.modeRadios) {
      if (radio.checked) return radio.value;
    }
    return 'single';
  }

  getMaxDownloads() {
    if (this.getMode() === 'single') return 0;
    const val = parseInt(this.maxInput?.value || '0', 10);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }

  async handleProbe() {
    const url = this.urlInput?.value.trim();
    if (!url) {
      this.setHint('URL manquante', true);
      return;
    }

    this.setHint('Analyse en cours…', false);
    this.toggleButtons(true);

    try {
      const result = await this.api.probe({
        url,
        noPlaylist: this.getMode() === 'single',
        maxDownloads: this.getMaxDownloads()
      });

      if (!result.ok) {
        this.setHint(result.error || 'Analyse impossible', true);
        return;
      }

      let message = this.getMode() === 'single'
        ? '1 morceau (vidéo seule)'
        : `≈ ${result.effectiveCount} morceau(x) (${result.kind === 'playlist' ? 'playlist' : 'piste'})`;
      
      if (result.title) message += ` — ${result.title}`;
      this.setHint(message, false);
    } catch (err) {
      this.setHint(err.message || 'Erreur lors de l\'analyse', true);
    } finally {
      this.toggleButtons(false);
    }
  }

  async handleDownload() {
    const url = this.urlInput?.value.trim();
    if (!url) {
      this.setHint('URL manquante', true);
      return;
    }

    this.toggleButtons(true);
    this.setHint('Démarrage du téléchargement…', false);
    this.clearLogs();

    try {
      const result = await this.api.startDownload({
        url,
        noPlaylist: this.getMode() === 'single',
        maxDownloads: this.getMaxDownloads()
      });

      this.currentJob = result.jobId;
      this.connectToJobStream(result.jobId);
    } catch (err) {
      this.setHint(err.message || 'Erreur lors du lancement', true);
      this.toggleButtons(false);
    }
  }

  connectToJobStream(jobId) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = this.api.streamJob(jobId);
    
    this.eventSource.addEventListener('log', (e) => {
      this.addLog(e.data);
    });

    this.eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      if (data.status === 'queued') {
        const eta =
          data.estimatedSeconds != null
            ? ` · ~${data.estimatedSeconds}s`
            : '';
        this.setHint(
          `⏳ En file d'attente — position ${data.position}/${data.queueLength}${eta}`,
          false
        );
      } else if (data.status === 'running') {
        this.setHint('Téléchargement en cours…', false);
      } else if (data.status === 'awaiting_local_worker') {
        this.setHint(
          'Préparation côté navigateur… Tu peux garder cette page ouverte quelques instants.',
          false
        );
      }
    });
    
    this.eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      this.updateProgress(data);
    });
    
    this.eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      this._handleJobComplete(data);
    });
    
    this.eventSource.addEventListener('error', () => {
      this._stopProgressAnim();
      this.setHint('Connexion perdue', true);
      this.toggleButtons(false);
      this.eventSource?.close();
    });
  }

  /**
   * Pourcentage global 0–100 (flottant), aligné sur le backend / RipperView d’origine.
   * @param {{ filePct: number, itemIndex: number, itemTotal: number }} p
   */
  static _computeOverall(p) {
    const { filePct, itemIndex, itemTotal } = p;
    const f = Number(filePct);
    const idx = Number(itemIndex);
    const tot = Number(itemTotal);
    if (!(Number.isFinite(f) && Number.isFinite(idx) && Number.isFinite(tot)) || tot <= 0) {
      return Math.min(100, Math.max(0, f));
    }
    return Math.min(
      100,
      Math.max(0, (((idx - 1) + f / 100) / tot) * 100)
    );
  }

  _stopProgressAnim() {
    if (this._progressRaf != null) {
      cancelAnimationFrame(this._progressRaf);
      this._progressRaf = null;
    }
  }

  _ensureProgressDom() {
    if (!this.progress) return null;
    if (this._progressDom) return this._progressDom;

    this.progress.innerHTML = `
      <div class="progress-meta">
        <span class="progress-file-pct"></span>
        <span class="progress-item-meta" hidden></span>
      </div>
      <progress class="progress-overall-bar" max="100" value="0"></progress>
      <div class="progress-foot">
        <span>Global</span>
        <span class="progress-overall-pct"></span>
      </div>
    `;
    this._progressDom = {
      filePct: this.progress.querySelector('.progress-file-pct'),
      itemMeta: this.progress.querySelector('.progress-item-meta'),
      bar: this.progress.querySelector('.progress-overall-bar'),
      overallPct: this.progress.querySelector('.progress-overall-pct')
    };
    return this._progressDom;
  }

  _paintProgressFrame() {
    const shell = this._ensureProgressDom();
    const t = this._progressTarget;
    const s = this._progressShown;
    if (!shell || !t || !s || !shell.bar || !shell.filePct || !shell.overallPct) {
      return;
    }

    const fileR = Math.round(s.filePct);
    const overallR = Math.round(s.overall);
    shell.filePct.textContent = `Fichier: ${fileR}%`;
    shell.bar.value = Math.min(100, Math.max(0, s.overall));
    shell.overallPct.textContent = `${overallR}%`;

    if (t.itemTotal > 1 && shell.itemMeta) {
      shell.itemMeta.hidden = false;
      shell.itemMeta.textContent = `Morceau ${t.itemIndex} / ${t.itemTotal}`;
    } else if (shell.itemMeta) {
      shell.itemMeta.hidden = true;
    }
  }

  updateProgress({ filePct, itemIndex, itemTotal }) {
    if (!this.progress) return;

    const f = Number(filePct);
    const idx = Number(itemIndex);
    const tot = Number(itemTotal);
    if (!Number.isFinite(f)) return;

    const overall = RipperView._computeOverall({
      filePct: f,
      itemIndex: Number.isFinite(idx) ? idx : 1,
      itemTotal: Number.isFinite(tot) && tot > 0 ? tot : 1
    });

    this._stopProgressAnim();
    const fileClamp = Math.min(100, Math.max(0, f));
    this._progressTarget = {
      overall,
      filePct: fileClamp,
      itemIndex: Number.isFinite(idx) ? idx : 1,
      itemTotal: Number.isFinite(tot) && tot > 0 ? tot : 1
    };
    this._progressShown = { overall, filePct: fileClamp };

    this._ensureProgressDom();
    this._paintProgressFrame();
  }

  _handleJobComplete(data) {
    this._stopProgressAnim();
    this.eventSource?.close();
    this.toggleButtons(false);
    
    if (data.success && data.files) {
      this.setHint(`✅ ${data.files.length} fichier(s) prêt(s) ! Téléchargement en cours...`, false);
      if (this.progress) {
        this._progressTarget = {
          overall: 100,
          filePct: 100,
          itemIndex: this._progressTarget?.itemIndex ?? 1,
          itemTotal: this._progressTarget?.itemTotal ?? 1
        };
        this._progressShown = { overall: 100, filePct: 100 };
        this._ensureProgressDom();
        this._paintProgressFrame();
      }
    } else {
      this.setHint(data.error || 'Échec du téléchargement', true);
    }
    
    // Callback externe (géré par RipperMode)
    if (this.onJobCompleteCallback) {
      this.onJobCompleteCallback(data);
    }
  }
  
  set onJobComplete(callback) {
    this.onJobCompleteCallback = callback;
  }

  addLog(line) {
    if (!this.logs) return;
    const logLine = createElement('div', { className: 'log-line' }, line);
    this.logs.appendChild(logLine);
    this.logs.scrollTop = this.logs.scrollHeight;
  }

  clearLogs() {
    this._stopProgressAnim();
    this._progressTarget = null;
    this._progressShown = null;
    this._progressDom = null;
    if (this.logs) this.logs.innerHTML = '';
    if (this.progress) this.progress.innerHTML = '';
  }

  setHint(text, isError = false) {
    if (!this.hint) return;
    
    if (!text) {
      this.hint.hidden = true;
      this.hint.innerHTML = '';
      return;
    }
    
    this.hint.hidden = false;
    this.hint.textContent = text;
    this.hint.classList.toggle('error', Boolean(isError));
  }

  toggleButtons(disabled) {
    if (this.probeBtn) this.probeBtn.disabled = disabled;
    if (this.downloadBtn) this.downloadBtn.disabled = disabled;
    if (this.urlInput) this.urlInput.disabled = disabled;
    this.modeRadios.forEach(r => r.disabled = disabled);
    if (this.maxInput) this.maxInput.disabled = disabled;
  }

  setUrl(url) {
    if (this.urlInput) this.urlInput.value = url;
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
