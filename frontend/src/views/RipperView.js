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
    
    this.eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      this.updateProgress(data);
    });
    
    this.eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      this.onJobComplete(data);
    });
    
    this.eventSource.addEventListener('error', () => {
      this.setHint('Connexion perdue', true);
      this.toggleButtons(false);
      this.eventSource?.close();
    });
  }

  updateProgress({ filePct, itemIndex, itemTotal }) {
    if (!this.progress) return;
    
    const overall = itemTotal > 0
      ? Math.min(100, Math.round((((itemIndex - 1) + filePct / 100) / itemTotal) * 100))
      : Math.round(filePct);
    
    this.progress.innerHTML = `
      <div class="progress-meta">
        <span>Fichier: ${Math.round(filePct)}%</span>
        ${itemTotal > 1 ? `<span>Morceau ${itemIndex} / ${itemTotal}</span>` : ''}
      </div>
      <progress value="${overall}" max="100"></progress>
      <div class="progress-foot">
        <span>Global</span>
        <span>${overall}%</span>
      </div>
    `;
  }

  onJobComplete(data) {
    this.eventSource?.close();
    this.toggleButtons(false);
    
    if (data.success && data.downloadUrl) {
      this.setHint('Terminé ! Téléchargement disponible.', false);
      // Créer lien de téléchargement
      const link = createElement('a', {
        href: data.downloadUrl,
        download: '',
        className: 'download-link'
      }, 'Télécharger le ZIP');
      this.hint.appendChild(link);
    } else {
      this.setHint(data.error || 'Échec du téléchargement', true);
    }
  }

  addLog(line) {
    if (!this.logs) return;
    const logLine = createElement('div', { className: 'log-line' }, line);
    this.logs.appendChild(logLine);
    this.logs.scrollTop = this.logs.scrollHeight;
  }

  clearLogs() {
    if (this.logs) this.logs.innerHTML = '';
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
