import { createElement } from '../utils/dom.js';

/**
 * Modal pour sélectionner un pays et afficher les tendances
 */
export class TrendingModal {
  constructor() {
    this.modal = null;
    this.onSelectCountry = null;
    this.musicOnly = false; // État de la checkbox
  }

  /**
   * Affiche la modal de sélection de pays
   */
  show() {
    this.render();
  }

  /**
   * Ferme la modal
   */
  close() {
    if (this.modal) {
      this.modal.classList.add('fade-out');
      setTimeout(() => {
        this.modal.remove();
        this.modal = null;
      }, 200);
    }
  }

  /**
   * Sélectionne un pays et ferme
   */
  selectCountry(countryCode) {
    if (this.onSelectCountry) {
      this.onSelectCountry(countryCode, this.musicOnly);
    }
    this.close();
  }

  /**
   * Obtient le drapeau emoji pour un code pays
   */
  getCountryFlag(code) {
    const flagMap = {
      'FR': '🇫🇷', 'US': '🇺🇸', 'GB': '🇬🇧', 'DE': '🇩🇪',
      'ES': '🇪🇸', 'IT': '🇮🇹', 'JP': '🇯🇵', 'KR': '🇰🇷',
      'BR': '🇧🇷', 'MX': '🇲🇽', 'CA': '🇨🇦', 'AU': '🇦🇺',
      'IN': '🇮🇳', 'RU': '🇷🇺', 'CN': '🇨🇳', 'AR': '🇦🇷',
      'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰',
      'FI': '🇫🇮', 'PL': '🇵🇱', 'TR': '🇹🇷', 'SA': '🇸🇦',
      'AE': '🇦🇪', 'EG': '🇪🇬', 'ZA': '🇿🇦', 'NG': '🇳🇬'
    };
    
    return flagMap[code] || '🌍';
  }

  /**
   * Liste des pays disponibles
   */
  getCountries() {
    return [
      { code: 'FR', name: 'France' },
      { code: 'US', name: 'États-Unis' },
      { code: 'GB', name: 'Royaume-Uni' },
      { code: 'DE', name: 'Allemagne' },
      { code: 'ES', name: 'Espagne' },
      { code: 'IT', name: 'Italie' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australie' },
      { code: 'BR', name: 'Brésil' },
      { code: 'MX', name: 'Mexique' },
      { code: 'AR', name: 'Argentine' },
      { code: 'JP', name: 'Japon' },
      { code: 'KR', name: 'Corée du Sud' },
      { code: 'IN', name: 'Inde' },
      { code: 'RU', name: 'Russie' },
      { code: 'NL', name: 'Pays-Bas' },
      { code: 'SE', name: 'Suède' },
      { code: 'NO', name: 'Norvège' },
      { code: 'DK', name: 'Danemark' },
      { code: 'FI', name: 'Finlande' },
      { code: 'PL', name: 'Pologne' },
      { code: 'TR', name: 'Turquie' },
      { code: 'SA', name: 'Arabie Saoudite' },
      { code: 'AE', name: 'Émirats Arabes Unis' },
      { code: 'EG', name: 'Égypte' },
      { code: 'ZA', name: 'Afrique du Sud' },
      { code: 'NG', name: 'Nigeria' }
    ];
  }

  /**
   * Crée et affiche la modal
   */
  render() {
    if (this.modal) {
      this.modal.remove();
    }

    const overlay = createElement('div', {
      className: 'modal-overlay',
      onClick: () => this.close()
    });

    const modalContent = createElement('div', {
      className: 'modal-content modal-trending',
      onClick: (e) => e.stopPropagation()
    });

    const header = createElement('div', { className: 'modal-header' });
    
    const title = createElement('h2', {
      className: 'modal-title'
    }, '🔥 Tendances par pays');
    
    const closeBtn = createElement('button', {
      className: 'modal-close',
      type: 'button',
      onClick: () => this.close()
    }, '×');
    
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = createElement('div', { className: 'modal-body' });
    
    // Checkbox pour filtrer uniquement la musique
    const filterContainer = createElement('div', { className: 'trending-filter' });
    
    const checkbox = createElement('input', {
      type: 'checkbox',
      id: 'music-only-checkbox',
      checked: this.musicOnly
    });
    
    checkbox.addEventListener('change', (e) => {
      this.musicOnly = e.target.checked;
    });
    
    const label = createElement('label', {
      htmlFor: 'music-only-checkbox',
      className: 'trending-filter-label'
    });
    
    const labelText = createElement('span', {}, '🎵 Musique uniquement');
    
    label.appendChild(checkbox);
    label.appendChild(labelText);
    filterContainer.appendChild(label);
    
    body.appendChild(filterContainer);
    
    const countryList = createElement('div', { className: 'trending-country-list' });
    
    const countries = this.getCountries();
    countries.forEach(country => {
      const item = createElement('button', {
        className: 'trending-country-item',
        type: 'button',
        onClick: () => this.selectCountry(country.code)
      });
      
      const flag = createElement('span', {
        className: 'country-flag'
      }, this.getCountryFlag(country.code));
      
      const name = createElement('span', {
        className: 'country-name'
      }, country.name);
      
      item.appendChild(flag);
      item.appendChild(name);
      countryList.appendChild(item);
    });
    
    body.appendChild(countryList);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    overlay.appendChild(modalContent);

    document.body.appendChild(overlay);
    this.modal = overlay;

    setTimeout(() => overlay.classList.add('show'), 10);

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
}
