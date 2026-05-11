import { $ } from './utils/dom.js';
import { ApiClient } from './api/ApiClient.js';
import { SearchMode } from './modes/SearchMode.js';
import { RipperMode } from './modes/RipperMode.js';
import { ProxyModal } from './views/ProxyModal.js';

/**
 * Application principale
 */
class App {
  constructor() {
    this.api = new ApiClient();
    this.proxyModal = new ProxyModal();
    
    // Deux modes complètement séparés
    this.searchMode = new SearchMode(this.api);
    this.ripperMode = new RipperMode(this.api);
    
    this.currentMode = 'search';
    this.init();
  }

  init() {
    // Bouton proxy modal
    const proxyBtn = $('#refresh-proxy-btn');
    if (proxyBtn) {
      proxyBtn.addEventListener('click', () => this.showProxyModal());
      this.updateProxyButton(); // Mettre à jour au démarrage
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
    console.log('[App] Basculer vers mode:', mode);
    if (mode === 'search') {
      this.ripperMode.hide();
      this.searchMode.show();
    } else {
      this.searchMode.hide();
      this.ripperMode.show();
    }
    this.currentMode = mode;
  }

  async showProxyModal() {
    await this.proxyModal.show();
    
    // Callback quand proxy sélectionné
    this.proxyModal.onSelect = (proxy) => {
      this.updateProxyButton();
    };
  }

  async updateProxyButton() {
    const btn = $('#refresh-proxy-btn');
    if (!btn) return;
    
    try {
      const response = await fetch('/api/proxy-status');
      const data = await response.json();
      
      if (data.enabled && data.country) {
        btn.textContent = `Proxy: ${data.country}`;
        btn.title = `${data.country} - ${data.city}`;
      } else {
        btn.textContent = 'Proxy';
        btn.title = 'Sélectionner un proxy';
      }
    } catch (error) {
      btn.textContent = 'Proxy';
    }
  }
}

// Démarrer l'app
new App();
