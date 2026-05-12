import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCorsOptions } from './corsOptions.js';
import { SearchEngine } from './search/SearchEngine.js';
import { probePlaylistCount, getTrending } from './ripper/probe.js';
import { JobManager } from './ripper/JobManager.js';
import { normalizePlaylistMaxDownloads } from './ripper/playlistLimit.js';
import { initProxyAtStartup, getProxyPool, selectProxyByIndex, refreshProxyPool, getCurrentProxy, getCurrentProxyInfo, resolveProxyUrl } from './proxy/proxyManager.js';
import workerIngestRoutes from './routes/workerIngest.js';
import { startWorkerConnectivityHeartbeat } from './workerConnectivityHeartbeat.js';
import { recordWorkerHealthy } from './workerIngestGate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, '..', 'cookies.txt');

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const searchEngine = new SearchEngine({
  maxResults: Number(process.env.SEARCH_MAX_RESULTS) || 10,
  ytDlpPath: process.env.YT_DLP_PATH
});

const jobManager = new JobManager();

function mediaContentType(filename) {
  const n = filename.toLowerCase();
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  if (n.endsWith('.mp4')) return 'video/mp4';
  if (n.endsWith('.webm')) return 'video/webm';
  if (n.endsWith('.mkv')) return 'video/x-matroska';
  return 'application/octet-stream';
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, index: number | undefined } | { ok: false, error: string }}
 */
function normalizeProxyIndex(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, index: undefined };
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    return { ok: false, error: 'proxyIndex doit être un entier' };
  }
  const poolLen = getProxyPool().length;
  if (poolLen === 0) {
    return { ok: true, index: undefined };
  }
  if (n < 0 || n >= poolLen) {
    return { ok: false, error: 'proxyIndex hors limites' };
  }
  return { ok: true, index: n };
}

/**
 * En-tête `X-Worker-Session` (UUID sessionStorage navigateur).
 * @param {string | string[] | undefined} raw
 * @returns {string}
 */
function parseWorkerSessionId(raw) {
  if (raw === undefined || raw === null) return '';
  const head = Array.isArray(raw) ? raw[0] : String(raw);
  const t = head.trim();
  if (t.length === 0 || t.length > 128) return '';
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) return '';
  return t;
}

const app = Fastify({ logger: true });

await app.register(cors, getCorsOptions());

await app.register(multipart, {
  limits: {
    fileSize: 512 * 1024 * 1024,
    files: 1
  }
});

// Rate limiting: protection contre le spam (localhost + routes worker exclus des compteurs)
await app.register(rateLimit, {
  max: 20, // 20 requêtes max
  timeWindow: '1 minute', // par minute
  allowList: async (req, key) => {
    if (
      key === '127.0.0.1' ||
      key === '::1' ||
      key === '::ffff:127.0.0.1'
    ) {
      return true;
    }
    const url = String(req.url || req.raw?.url || '').split('?')[0];
    return url.startsWith('/api/worker');
  },
  errorResponseBuilder: () => ({
    error: '🚫 Trop de requêtes. Réessaye dans 1 minute.',
    statusCode: 429
  })
});

await app.register(workerIngestRoutes, {
  prefix: '/api/worker',
  jobManager
});

app.get('/health', async () => ({ ok: true }));

/**
 * Vérifie que le worker local répond, si WORKER_LOCAL_URL est défini
 * (service déployé depuis le bundle worker copié sur la machine hôte).
 * Tunnel SSH -R écoute sur l’hôte : depuis l’API **dans Docker**, utiliser
 * http://host.docker.internal:<port> (cf. SSH_RPORT sur le worker, ex. 7410 et extra_hosts compose).
 * Logs périodiques optionnels : WORKER_CONNECTIVITY_LOG_MS (voir workerConnectivityHeartbeat.js).
 */
app.get('/api/worker-local/health', async (request, reply) => {
  const base = process.env.WORKER_LOCAL_URL?.trim().replace(/\/$/, '');
  if (!base) {
    return {
      configured: false,
      message:
        'WORKER_LOCAL_URL non définie. Ex. http://IP:4100 pour joindre le serveur local.'
    };
  }

  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(8000)
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      recordWorkerHealthy();
    }
    return {
      configured: true,
      reachable: res.ok,
      status: res.status,
      worker: body
    };
  } catch (err) {
    return reply.status(502).send({
      configured: true,
      reachable: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

// Route pour obtenir le statut du proxy
app.get('/api/proxy-status', async () => {
  const proxy = getCurrentProxy();
  const info = getCurrentProxyInfo();
  return {
    enabled: !!proxy,
    masked: proxy ? proxy.replace(/:([^:@]+)@/, ':****@') : null,
    country: info?.country || null,
    city: info?.city || null
  };
});

// Route pour obtenir la liste complète des proxies
app.get('/api/proxies', async () => {
  const pool = getProxyPool();

  if (pool.length === 0) {
    return {
      ok: true,
      proxies: [],
      total: 0,
      message:
        'Aucun proxy dans le pool. Configurez WEBSHARE_API_KEY ou PROXY_URL sur l’API.'
    };
  }

  return {
    ok: true,
    proxies: pool,
    total: pool.length
  };
});

// Route pour sélectionner un proxy par index
app.post('/api/proxies/select', async (request, reply) => {
  const { index } = request.body || {};
  
  if (typeof index !== 'number') {
    return reply.status(400).send({
      ok: false,
      error: 'Index manquant ou invalide'
    });
  }
  
  try {
    const info = selectProxyByIndex(index);
    
    return {
      ok: true,
      message: `Proxy sélectionné: ${info.country} - ${info.city}`,
      proxy: info
    };
  } catch (error) {
    return reply.status(400).send({
      ok: false,
      error: error.message
    });
  }
});

// Route pour actualiser le pool de proxies (refetch depuis WebShare)
app.post('/api/proxies/refresh', async (request, reply) => {
  const apiKey = process.env.WEBSHARE_API_KEY;
  
  if (!apiKey) {
    return reply.status(400).send({
      ok: false,
      error: 'WEBSHARE_API_KEY non configurée'
    });
  }
  
  try {
    app.log.info('Rafraîchissement du pool de proxies...');
    const count = await refreshProxyPool(apiKey);
    const info = getCurrentProxyInfo();
    
    return {
      ok: true,
      message: `Pool rafraîchi: ${count} proxies disponibles`,
      current: info,
      total: count
    };
  } catch (error) {
    app.log.error('Erreur actualisation proxy:', error);
    return reply.status(500).send({
      ok: false,
      error: error.message || 'Échec du rafraîchissement du pool'
    });
  }
});

app.get('/api/search', async (request, reply) => {
  const q = request.query.q;
  try {
    const payload = await searchEngine.search(
      typeof q === 'string' ? q : ''
    );
    return payload;
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number(err.statusCode) || 500
        : 500;
    const message =
      err instanceof Error ? err.message : 'Erreur recherche';
    reply.status(status).send({ error: message });
  }
});

// Découverte : mot-clé aléatoire (recherche YouTube, pas le feed officiel Tendances)
app.get('/api/trending', async (request, reply) => {
  const maxResults = Number(request.query.limit) || 20;
  const musicOnly = request.query.musicOnly === 'true';

  const p = normalizeProxyIndex(request.query.proxyIndex);
  if (!p.ok) {
    return reply.status(400).send({ error: p.error });
  }

  try {
    const proxyUrl = resolveProxyUrl(p.index);
    const payload = await getTrending(maxResults, musicOnly, { proxyUrl });
    return payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur tendances';
    reply.status(500).send({ error: message });
  }
});

app.post('/api/probe', async (request, reply) => {
  const { url, noPlaylist, maxDownloads, proxyIndex } = request.body || {};

  const p = normalizeProxyIndex(proxyIndex);
  if (!p.ok) {
    return reply.status(400).send({ ok: false, error: p.error });
  }

  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ 
      ok: false, 
      error: 'URL manquante ou invalide' 
    });
  }

  try {
    const proxyUrl = resolveProxyUrl(p.index);
    const result = await probePlaylistCount(url.trim(), { 
      noPlaylist: Boolean(noPlaylist),
      proxyUrl
    });
    
    let effectiveCount = result.count;
    if (Boolean(noPlaylist)) {
      effectiveCount = 1;
    } else {
      const limit = normalizePlaylistMaxDownloads(false, maxDownloads);
      effectiveCount = Math.min(result.count, limit);
    }
    
    return {
      ok: true,
      kind: result.kind,
      count: result.count,
      title: result.title,
      effectiveCount
    };
  } catch (err) {
    app.log.error('Probe error:', err);
    return reply.status(500).send({ 
      ok: false, 
      error: err.message || 'Échec de l\'analyse' 
    });
  }
});

app.post('/api/download', async (request, reply) => {
  const { url, noPlaylist, maxDownloads, proxyIndex } = request.body || {};

  const p = normalizeProxyIndex(proxyIndex);
  if (!p.ok) {
    return reply.status(400).send({ error: p.error });
  }
  
  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ 
      error: 'URL manquante ou invalide' 
    });
  }

  const clientIp = request.headers['x-forwarded-for'] || request.ip;
  const workerSessionId = parseWorkerSessionId(
    request.headers['x-worker-session']
  );

  try {
    const noPl = Boolean(noPlaylist);
    const jobId = jobManager.createJob({
      url: url.trim(),
      noPlaylist: noPl,
      maxDownloads: normalizePlaylistMaxDownloads(noPl, maxDownloads),
      ip: clientIp,
      proxyIndex: p.index,
      workerSessionId
    });
    
    return { jobId };
  } catch (err) {
    app.log.error('Download error:', err);
    return reply.status(500).send({ 
      error: err.message || 'Échec du démarrage' 
    });
  }
});

app.post('/api/download-batch', async (request, reply) => {
  const { urls, proxyIndex } = request.body || {};

  const p = normalizeProxyIndex(proxyIndex);
  if (!p.ok) {
    return reply.status(400).send({ error: p.error });
  }
  
  if (!Array.isArray(urls) || urls.length === 0) {
    return reply.status(400).send({ 
      error: 'URLs manquantes ou invalides' 
    });
  }
  
  if (urls.length > 50) {
    return reply.status(400).send({ 
      error: 'Maximum 50 URLs' 
    });
  }

  const clientIp = request.headers['x-forwarded-for'] || request.ip;
  const workerSessionId = parseWorkerSessionId(
    request.headers['x-worker-session']
  );

  try {
    const jobId = jobManager.createBatchJob({
      urls: urls.map(u => String(u).trim()),
      ip: clientIp,
      proxyIndex: p.index,
      workerSessionId
    });
    
    return { jobId };
  } catch (err) {
    app.log.error('Batch download error:', err);
    return reply.status(500).send({ 
      error: err.message || 'Échec du démarrage' 
    });
  }
});

app.get('/api/jobs/:jobId/stream', async (request, reply) => {
  const { jobId } = request.params;
  const job = jobManager.getJob(jobId);
  
  if (!job) {
    return reply.status(404).send({ error: 'Job introuvable' });
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendEvent = (event, data) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  };

  job.logs.forEach(line => sendEvent('log', line));

  const initialStatus = jobManager.getQueueStatus(jobId);
  if (initialStatus) {
    sendEvent('status', initialStatus);
  }

  if (job.progress) {
    sendEvent('progress', job.progress);
  }

  const unsubscribe = jobManager.onJobEvent(jobId, (eventData) => {
    if (eventData.type === 'log') {
      sendEvent('log', eventData.line);
    } else if (eventData.type === 'status') {
      sendEvent('status', {
        status: eventData.status,
        position: eventData.position,
        queueLength: eventData.queueLength,
        estimatedSeconds: eventData.estimatedSeconds
      });
    } else if (eventData.type === 'progress') {
      sendEvent('progress', eventData.progress);
    } else if (eventData.type === 'complete') {
      sendEvent('complete', {
        success: eventData.success,
        files: eventData.files || [],
        error: eventData.error
      });
      reply.raw.end();
      unsubscribe();
    }
  });

  request.raw.on('close', () => {
    unsubscribe();
  });

  if (job.status === 'completed' || job.status === 'failed') {
    sendEvent('complete', {
      success: job.status === 'completed',
      files: job.files ? job.files.map((file, index) => ({
        name: file.name,
        url: `/api/jobs/${jobId}/file/${index}`,
        size: file.size
      })) : [],
      error: job.error
    });
    reply.raw.end();
    unsubscribe();
  }
});

app.get('/api/jobs/:jobId/file/:index', async (request, reply) => {
  const { jobId, index } = request.params;
  const job = jobManager.getJob(jobId);
  
  if (!job || !job.files) {
    return reply.status(404).send({ error: 'Job introuvable' });
  }

  const fileIndex = parseInt(index, 10);
  if (!Number.isFinite(fileIndex) || fileIndex < 0 || fileIndex >= job.files.length) {
    return reply.status(404).send({ error: 'Fichier introuvable' });
  }

  const file = job.files[fileIndex];
  
  try {
    const stats = await stat(file.path);
    const stream = createReadStream(file.path);
    
    reply.header('Content-Type', mediaContentType(file.name));
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    reply.header('Content-Length', stats.size);
    
    // Supprimer le fichier après l'avoir envoyé
    stream.on('end', async () => {
      try {
        await fs.unlink(file.path);
        console.log(`[Cleanup] Fichier supprimé: ${file.name}`);
        
        // Si tous les fichiers média sont partis, supprimer le dossier du job
        const remainingFiles = await fs.readdir(job.jobDir);
        const hasMediaLeft = remainingFiles.some((f) =>
          /\.(mp3|mp4|webm|mkv)$/i.test(f)
        );
        if (!hasMediaLeft) {
          await fs.rm(job.jobDir, { recursive: true, force: true });
          console.log(`[Cleanup] Dossier job supprimé: ${jobId}`);
        }
      } catch (err) {
        console.error(`[Cleanup] Erreur suppression ${file.name}:`, err);
      }
    });
    
    return reply.send(stream);
  } catch (err) {
    app.log.error('Download file error:', err);
    return reply.status(500).send({ error: 'Échec du téléchargement' });
  }
});

setInterval(() => {
  jobManager.cleanupOldJobs(3600_000);
}, 600_000);

try {
  // Initialiser le proxy au démarrage
  await initProxyAtStartup();
  
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API http://${HOST}:${PORT}`);
  
  // Vérifier le statut de l'authentification YouTube
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 Statut authentification YouTube:');
  if (existsSync(COOKIES_PATH)) {
    console.log('   ✅ Cookies détectés (cookies.txt)');
    console.log('   📍 Fichier:', COOKIES_PATH);
    console.log('   🎯 Mode: Authentifié');
  } else {
    console.log('   ⚠️  Cookies non trouvés');
    console.log('   📍 Attendu à:', COOKIES_PATH);
    console.log('   🎯 Mode: Anonyme (risque de détection bot)');
    console.log('   💡 Solution: Copier le fichier cookies.txt');
  }
  
  const currentProxy = getCurrentProxy();
  if (currentProxy) {
    const masked = currentProxy.replace(/:([^:@]+)@/, ':****@');
    console.log('\n🌐 Proxy HTTP:');
    console.log('   ✅ Proxy actif:', masked);
  } else {
    console.log('\n🌐 Proxy HTTP:');
    console.log('   ⚠️  Aucun proxy configuré (IP VPS directe)');
    if (process.env.WEBSHARE_API_KEY) {
      console.log('   💡 Utilise le bouton "Actualiser proxy" dans l\'interface');
    }
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  startWorkerConnectivityHeartbeat(app);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
