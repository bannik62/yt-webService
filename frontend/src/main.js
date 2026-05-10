import { $ } from './utils/dom.js';
import { ApiClient } from './api/ApiClient.js';
import { SearchMode } from './modes/SearchMode.js';
import { RipperMode } from './modes/RipperMode.js';

/**
 * Application principale
 */
class App {
  constructor() {
    this.api = new ApiClient();
    
    // Deux modes complètement séparés
    this.searchMode = new SearchMode(this.api);
    this.ripperMode = new RipperMode(this.api);
    
    this.currentMode = 'search';
    this.init();
  }

  init() {
    // Bouton actualiser proxy
    const refreshProxyBtn = $('#refresh-proxy-btn');
    if (refreshProxyBtn) {
      refreshProxyBtn.addEventListener('click', () => this.refreshProxy());
    }
    
    // Toggle entre modes
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.switchMode(e.target.value);
        }
      });
      
      // Initialiser le mode selon le radio coché par défaut
      if (radio.checked) {
        this.currentMode = radio.value;
      }
    });
    
    // Afficher le mode initial
    this.switchMode(this.currentMode);
  }

  switchMode(mode) {
    if (mode === 'search') {
      this.ripperMode.hide();
      this.searchMode.show();
    } else {
      this.searchMode.hide();
      this.ripperMode.show();
    }
    this.currentMode = mode;
  }

  async refreshProxy() {
    const btn = $('#refresh-proxy-btn');
    if (!btn) return;
    
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ ...';
    
    try {
      const response = await fetch('/api/refresh-proxy', { method: 'POST' });
      const data = await response.json();
      
      if (data.ok) {
        btn.textContent = '✅ OK';
        alert(`✅ Proxy actualisé !\n\n${data.message}`);
      } else {
        btn.textContent = '❌ Erreur';
        alert(`❌ Erreur : ${data.error}`);
      }
    } catch (error) {
      btn.textContent = '❌ Erreur';
      alert(`❌ Impossible d'actualiser le proxy : ${error.message}`);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = originalText;
      }, 2000);
    }
  }
}

// Démarrer l'app
new App();
