import { promisify } from 'node:util';
import { exec as execCallback } from 'node:child_process';

const exec = promisify(execCallback);

/**
 * Récupère un proxy aléatoire depuis WebShare API
 * @param {string} apiKey - WebShare API Key
 * @returns {Promise<{proxy: string, country: string}>}
 */
export async function fetchWebShareProxy(apiKey) {
  if (!apiKey) {
    throw new Error('WebShare API Key manquante');
  }

  try {
    const response = await fetch('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=25', {
      headers: {
        'Authorization': `Token ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`WebShare API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      throw new Error('Aucun proxy disponible sur WebShare');
    }

    // Prendre un proxy aléatoire parmi les résultats
    const randomProxy = data.results[Math.floor(Math.random() * data.results.length)];
    
    const proxyUrl = `http://${randomProxy.username}:${randomProxy.password}@${randomProxy.proxy_address}:${randomProxy.port}`;
    
    return {
      proxy: proxyUrl,
      country: randomProxy.country_code || 'Unknown',
      city: randomProxy.city_name || 'Unknown'
    };
  } catch (error) {
    console.error('[WebShare] Erreur:', error);
    throw error;
  }
}

/**
 * Teste si un proxy fonctionne avec YouTube
 * @param {string} proxyUrl
 * @returns {Promise<boolean>}
 */
export async function testProxyWithYouTube(proxyUrl) {
  try {
    // Timeout de 10 secondes
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://www.youtube.com/', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      // Note: fetch natif ne supporte pas les proxies HTTP directement
      // On utilise une approche simplifiée ici
    });

    clearTimeout(timeout);
    
    const text = await response.text();
    
    // Vérifier si YouTube nous a bloqué
    if (text.includes('Sign in to confirm') || text.includes('unusual traffic')) {
      return false;
    }
    
    return response.ok;
  } catch (error) {
    console.error('[Proxy Test] Erreur:', error.message);
    return false;
  }
}

// Variable globale pour stocker le proxy actuel en mémoire
let currentProxy = process.env.PROXY_URL || null;

/**
 * Obtient le proxy actuel
 */
export function getCurrentProxy() {
  return currentProxy;
}

/**
 * Définit le proxy actuel
 */
export function setCurrentProxy(proxyUrl) {
  currentProxy = proxyUrl;
  console.log('[Proxy] Nouveau proxy configuré:', proxyUrl ? `${proxyUrl.split('@')[1]}` : 'aucun');
}

/**
 * Initialise le proxy au démarrage si WEBSHARE_API_KEY est définie
 */
export async function initProxyAtStartup() {
  const apiKey = process.env.WEBSHARE_API_KEY;
  
  // Si PROXY_URL est déjà défini, on l'utilise
  if (process.env.PROXY_URL) {
    setCurrentProxy(process.env.PROXY_URL);
    console.log('[Proxy] Utilisation du PROXY_URL défini dans .env');
    return;
  }
  
  // Sinon, si on a une API key, on récupère un proxy automatiquement
  if (apiKey) {
    try {
      console.log('[Proxy] Récupération automatique d\'un proxy WebShare...');
      const { proxy, country, city } = await fetchWebShareProxy(apiKey);
      setCurrentProxy(proxy);
      console.log(`[Proxy] Proxy initialisé: ${country} - ${city}`);
    } catch (error) {
      console.error('[Proxy] Impossible de récupérer un proxy au démarrage:', error.message);
    }
  }
}
