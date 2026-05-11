import { promisify } from 'node:util';
import { exec as execCallback } from 'node:child_process';

const exec = promisify(execCallback);

/**
 * Récupère la liste complète des proxies depuis WebShare API
 * @param {string} apiKey - WebShare API Key
 * @returns {Promise<Array<{proxy: string, country: string, city: string}>>}
 */
export async function fetchWebShareProxyList(apiKey) {
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

    // Retourner toute la liste
    return data.results.map(p => ({
      proxy: `http://${p.username}:${p.password}@${p.proxy_address}:${p.port}`,
      country: p.country_code || 'Unknown',
      city: p.city_name || 'Unknown'
    }));
  } catch (error) {
    console.error('[WebShare] Erreur:', error);
    throw error;
  }
}

/**
 * Récupère un proxy aléatoire depuis WebShare API (ancienne méthode, garde pour compatibilité)
 * @param {string} apiKey - WebShare API Key
 * @returns {Promise<{proxy: string, country: string, city: string}>}
 */
export async function fetchWebShareProxy(apiKey) {
  const list = await fetchWebShareProxyList(apiKey);
  const randomProxy = list[Math.floor(Math.random() * list.length)];
  return randomProxy;
}

// Variables globales pour gérer le pool de proxies
let currentProxy = process.env.PROXY_URL || null;
let proxyPool = []; // Liste complète des proxies disponibles
let currentProxyIndex = -1; // Index du proxy actuel dans le pool
let currentProxyInfo = null; // { country, city, masked }

/**
 * Obtient le proxy actuel
 */
export function getCurrentProxy() {
  return currentProxy;
}

/**
 * Obtient les infos du proxy actuel
 */
export function getCurrentProxyInfo() {
  return currentProxyInfo;
}

/**
 * URL du proxy au pool[index] (ne modifie pas currentProxy).
 * @param {number} index
 * @returns {string | null}
 */
export function getProxyUrlAtIndex(index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= proxyPool.length
  ) {
    return null;
  }
  return proxyPool[index].proxy;
}

/**
 * Index explicite dans le pool → URL ; sinon proxy global (PROXY_URL / dernier select).
 * @param {number | undefined} proxyIndex
 * @returns {string | null}
 */
export function resolveProxyUrl(proxyIndex) {
  if (proxyIndex !== undefined && proxyIndex !== null) {
    const url = getProxyUrlAtIndex(proxyIndex);
    if (url) return url;
  }
  return getCurrentProxy();
}

/**
 * Obtient la liste complète des proxies avec indication du proxy actuel
 */
export function getProxyPool() {
  return proxyPool.map((p, index) => ({
    index,
    country: p.country,
    city: p.city,
    masked: p.proxy.replace(/:([^:@]+)@/, ':****@'),
    active: index === currentProxyIndex
  }));
}

/**
 * Définit le proxy actuel par index dans le pool
 */
export function selectProxyByIndex(index) {
  if (index < 0 || index >= proxyPool.length) {
    throw new Error(`Index invalide: ${index} (pool size: ${proxyPool.length})`);
  }
  
  const selected = proxyPool[index];
  currentProxy = selected.proxy;
  currentProxyIndex = index;
  currentProxyInfo = {
    country: selected.country,
    city: selected.city,
    masked: selected.proxy.replace(/:([^:@]+)@/, ':****@')
  };
  
  console.log(`[Proxy] Proxy sélectionné: ${selected.country} - ${selected.city}`);
  return currentProxyInfo;
}

/**
 * Définit le proxy actuel (ancienne méthode, garde pour compatibilité)
 */
export function setCurrentProxy(proxyUrl) {
  currentProxy = proxyUrl;
  console.log('[Proxy] Nouveau proxy configuré:', proxyUrl ? `${proxyUrl.split('@')[1]}` : 'aucun');
}

/**
 * Rafraîchit le pool de proxies depuis WebShare
 */
export async function refreshProxyPool(apiKey) {
  console.log('[Proxy] Rafraîchissement du pool de proxies...');
  const list = await fetchWebShareProxyList(apiKey);
  proxyPool = list;
  
  // Sélectionner le premier par défaut
  if (proxyPool.length > 0) {
    selectProxyByIndex(0);
  }
  
  console.log(`[Proxy] Pool rafraîchi: ${proxyPool.length} proxies disponibles`);
  return proxyPool.length;
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
  
  // Sinon, si on a une API key, on récupère le pool automatiquement
  if (apiKey) {
    try {
      console.log('[Proxy] Récupération automatique du pool de proxies WebShare...');
      await refreshProxyPool(apiKey);
      const info = getCurrentProxyInfo();
      console.log(`[Proxy] Pool initialisé avec ${proxyPool.length} proxies`);
      console.log(`[Proxy] Proxy actuel: ${info.country} - ${info.city}`);
    } catch (error) {
      console.error('[Proxy] Impossible de récupérer le pool au démarrage:', error.message);
    }
  }
}
