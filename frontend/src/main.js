import { ApiClient } from './api/ApiClient.js';
import { SearchView } from './views/SearchView.js';
import { RipperView } from './views/RipperView.js';
import { $ } from './utils/dom.js';

/**
 * Application principale
 */
class App {
  constructor() {
    this.api = new ApiClient();
    this.searchView = new SearchView(this.api);
    this.ripperView = new RipperView(this.api);
    this.currentMode = 'search';
    
    this.init();
  }

  init() {
    // Toggle mode
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.switchMode(e.target.value);
        }
      });
    });
    
    // Connecter le clic sur résultat de recherche → ripper
    this.searchView.onResultClick = (item) => {
      // Changer le radio
      const ripperRadio = document.querySelector('input[name="mode"][value="ripper"]');
      if (ripperRadio) ripperRadio.checked = true;
      
      this.switchMode('ripper');
      this.ripperView.setUrl(item.url);
      this.ripperView.setHint(`Vidéo sélectionnée : ${item.title}`, false);
    };
    
    // Démarrer en mode recherche
    this.switchMode('search');
  }

  switchMode(mode) {
    this.currentMode = mode;
    
    if (mode === 'search') {
      this.searchView.show();
      this.ripperView.hide();
    } else {
      this.searchView.hide();
      this.ripperView.show();
    }
  }
}

// Démarrer l'app
new App();
