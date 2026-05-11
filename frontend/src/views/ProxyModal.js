import { createElement } from '../utils/dom.js';

/**
 * Retourne l'emoji du drapeau pour un code pays
 * @param {string} countryCode - Code pays ISO (ex: "FR", "US", "GB")
 * @returns {string}
 */
function getCountryFlag(countryCode) {
  if (!countryCode) return '🌐';
  
  // Mapping manuel pour les codes spéciaux
  const flagMap = {
    'GB': '🇬🇧',
    'UK': '🇬🇧', 
    'US': '🇺🇸',
    'FR': '🇫🇷',
    'DE': '🇩🇪',
    'ES': '🇪🇸',
    'IT': '🇮🇹',
    'JP': '🇯🇵',
    'CA': '🇨🇦',
    'AU': '🇦🇺',
    'NL': '🇳🇱',
    'SE': '🇸🇪',
    'NO': '🇳🇴',
    'DK': '🇩🇰',
    'FI': '🇫🇮',
    'PL': '🇵🇱',
    'BR': '🇧🇷',
    'IN': '🇮🇳',
    'SG': '🇸🇬',
    'KR': '🇰🇷'
  };
  
  const code = countryCode.toUpperCase();
  
  // Si mapping manuel existe, l'utiliser
  if (flagMap[code]) {
    return flagMap[code];
  }
  
  // Sinon essayer la conversion Unicode
  if (code.length === 2) {
    const codePoints = code.split('').map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
  }
  
  return '🌐';
}

/**
 * Modal pour sélectionner un proxy
 */
export class ProxyModal {
  constructor() {
    this.modal = null;
    this.proxies = [];
    this.onSelect = null;
    this.onRefresh = null;
  }

  /**
   * Affiche le modal avec la liste des proxies
   * @param {Array} proxies - Liste des proxies
   */
  async show() {
    // Charger la liste des proxies
    try {
      const response = await fetch('/api/proxies');
      if (!response.ok) {
        throw new Error('Impossible de charger les proxies');
      }
      const data = await response.json();
      this.proxies = data.proxies || [];
    } catch (error) {
      alert(`❌ ${error.message}`);
      return;
    }

    this.render();
  }

  /**
   * Ferme le modal
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
   * Rafraîchit la liste des proxies
   */
  async refresh() {
    const refreshBtn = this.modal?.querySelector('.btn-refresh');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ Chargement...';
    }

    try {
      const response = await fetch('/api/proxies/refresh', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Impossible de rafraîchir les proxies');
      }
      
      const data = await response.json();
      
      // Recharger la liste
      const listResponse = await fetch('/api/proxies');
      const listData = await listResponse.json();
      this.proxies = listData.proxies || [];
      
      // Re-render
      this.close();
      setTimeout(() => this.render(), 300);
      
      // Notification
      alert(`✅ ${data.message}`);
    } catch (error) {
      alert(`❌ ${error.message}`);
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Actualiser la liste';
      }
    }
  }

  /**
   * Sélectionne un proxy
   */
  async selectProxy(index) {
    try {
      const response = await fetch('/api/proxies/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index })
      });
      
      if (!response.ok) {
        throw new Error('Impossible de sélectionner ce proxy');
      }
      
      const data = await response.json();
      
      // Callback
      if (this.onSelect) {
        this.onSelect(data.proxy);
      }
      
      // Fermer modal
      this.close();
      
      // Notification
      alert(`✅ ${data.message}`);
    } catch (error) {
      alert(`❌ ${error.message}`);
    }
  }

  /**
   * Crée et affiche le modal
   */
  render() {
    // Fermer modal existant
    if (this.modal) {
      this.modal.remove();
    }

    // Overlay
    const overlay = createElement('div', {
      className: 'modal-overlay',
      onClick: () => this.close()
    });

    // Modal content
    const modalContent = createElement('div', {
      className: 'modal-content modal-proxy',
      onClick: (e) => e.stopPropagation()
    });

    // Header
    const header = createElement('div', { className: 'modal-header' });
    
    const title = createElement('h2', {
      className: 'modal-title'
    }, '🌐 Sélection du Proxy');
    
    const closeBtn = createElement('button', {
      className: 'modal-close',
      type: 'button',
      onClick: () => this.close()
    }, '×');
    
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body avec liste
    const body = createElement('div', { className: 'modal-body' });
    
    if (this.proxies.length === 0) {
      body.innerHTML = '<p class="proxy-empty">Aucun proxy disponible.</p>';
    } else {
      const proxyList = createElement('ul', { className: 'proxy-list' });
      
      this.proxies.forEach((proxy) => {
        const li = createElement('li', {
          className: `proxy-item ${proxy.active ? 'active' : ''}`,
          onClick: () => {
            if (!proxy.active) {
              this.selectProxy(proxy.index);
            }
          }
        });
        
        const radio = createElement('input', {
          type: 'radio',
          name: 'proxy',
          checked: proxy.active,
          onChange: () => {}
        });
        
        const flag = createElement('span', {
          className: 'proxy-flag'
        }, getCountryFlag(proxy.country));
        
        const info = createElement('div', { className: 'proxy-info' });
        const location = createElement('div', {
          className: 'proxy-location'
        }, `${proxy.country} - ${proxy.city}`);
        const masked = createElement('div', {
          className: 'proxy-address'
        }, proxy.masked);
        
        info.appendChild(location);
        info.appendChild(masked);
        
        li.appendChild(radio);
        li.appendChild(flag);
        li.appendChild(info);
        
        if (proxy.active) {
          const badge = createElement('span', {
            className: 'proxy-badge'
          }, '✓ Actif');
          li.appendChild(badge);
        }
        
        proxyList.appendChild(li);
      });
      
      body.appendChild(proxyList);
    }

    // Footer avec boutons
    const footer = createElement('div', { className: 'modal-footer' });
    
    const refreshBtn = createElement('button', {
      className: 'btn btn-ghost btn-refresh',
      type: 'button',
      onClick: () => this.refresh()
    }, '🔄 Actualiser la liste');
    
    const closeFooterBtn = createElement('button', {
      className: 'btn btn-secondary',
      type: 'button',
      onClick: () => this.close()
    }, 'Fermer');
    
    footer.appendChild(refreshBtn);
    footer.appendChild(closeFooterBtn);

    // Assemblage
    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    overlay.appendChild(modalContent);

    // Ajout au DOM
    document.body.appendChild(overlay);
    this.modal = overlay;

    // Animation d'entrée
    setTimeout(() => overlay.classList.add('show'), 10);

    // ESC pour fermer
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
}
