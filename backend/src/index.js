import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCorsOptions } from './corsOptions.js';
import { SearchEngine } from './search/SearchEngine.js';
import { probePlaylistCount } from './ripper/probe.js';
import { JobManager } from './ripper/JobManager.js';
import { initProxyAtStartup, fetchWebShareProxy, setCurrentProxy, getCurrentProxy } from './proxy/proxyManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, '..', 'cookies.txt');

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const searchEngine = new SearchEngine({
  maxResults: Number(process.env.SEARCH_MAX_RESULTS) || 10,
  ytDlpPath: process.env.YT_DLP_PATH
});

const jobManager = new JobManager();

const app = Fastify({ logger: true });

await app.register(cors, getCorsOptions());

// Rate limiting: protection contre le spam
await app.register(rateLimit, {
  max: 20,                    // 20 requêtes max
  timeWindow: '1 minute',     // par minute
  allowList: ['127.0.0.1'],   // Localhost illimité (pour les tests)
  errorResponseBuilder: () => ({
    error: '🚫 Trop de requêtes. Réessaye dans 1 minute.',
    statusCode: 429
  })
});

app.get('/health', async () => ({ ok: true }));

// Route pour obtenir le statut du proxy
app.get('/api/proxy-status', async () => {
  const proxy = getCurrentProxy();
  return {
    enabled: !!proxy,
    masked: proxy ? proxy.replace(/:([^:@]+)@/, ':****@') : null
  };
});

// Route pour actualiser le proxy (nécessite WEBSHARE_API_KEY)
app.post('/api/refresh-proxy', async (request, reply) => {
  const apiKey = process.env.WEBSHARE_API_KEY;
  
  if (!apiKey) {
    return reply.status(400).send({
      ok: false,
      error: 'WEBSHARE_API_KEY non configurée'
    });
  }
  
  try {
    app.log.info('Actualisation du proxy WebShare...');
    const { proxy, country, city } = await fetchWebShareProxy(apiKey);
    setCurrentProxy(proxy);
    
    const masked = proxy.replace(/:([^:@]+)@/, ':****@');
    
    return {
      ok: true,
      proxy: masked,
      country,
      city,
      message: `Nouveau proxy activé: ${country} - ${city}`
    };
  } catch (error) {
    app.log.error('Erreur actualisation proxy:', error);
    return reply.status(500).send({
      ok: false,
      error: error.message || 'Échec de l\'actualisation du proxy'
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

app.post('/api/probe', async (request, reply) => {
  const { url, noPlaylist, maxDownloads } = request.body || {};
  
  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ 
      ok: false, 
      error: 'URL manquante ou invalide' 
    });
  }

  try {
    const result = await probePlaylistCount(url.trim(), { 
      noPlaylist: Boolean(noPlaylist) 
    });
    
    let effectiveCount = result.count;
    if (Boolean(noPlaylist)) {
      effectiveCount = 1;
    } else if (maxDownloads && maxDownloads > 0) {
      effectiveCount = Math.min(result.count, maxDownloads);
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
  const { url, noPlaylist, maxDownloads } = request.body || {};
  
  if (!url || typeof url !== 'string') {
    return reply.status(400).send({ 
      error: 'URL manquante ou invalide' 
    });
  }

  const clientIp = request.headers['x-forwarded-for'] || request.ip;

  try {
    const jobId = jobManager.createJob({
      url: url.trim(),
      noPlaylist: Boolean(noPlaylist),
      maxDownloads: Number(maxDownloads) || 0,
      ip: clientIp
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
  const { urls } = request.body || {};
  
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

  try {
    const jobId = jobManager.createBatchJob({
      urls: urls.map(u => String(u).trim()),
      ip: clientIp
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
  
  if (job.progress) {
    sendEvent('progress', job.progress);
  }

  const unsubscribe = jobManager.onJobEvent(jobId, (eventData) => {
    if (eventData.type === 'log') {
      sendEvent('log', eventData.line);
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
    
    reply.header('Content-Type', 'audio/mpeg');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    reply.header('Content-Length', stats.size);
    
    // Supprimer le fichier après l'avoir envoyé
    stream.on('end', async () => {
      try {
        await fs.unlink(file.path);
        console.log(`[Cleanup] Fichier supprimé: ${file.name}`);
        
        // Si tous les fichiers sont téléchargés, supprimer le dossier du job
        const remainingFiles = await fs.readdir(job.jobDir);
        if (remainingFiles.filter(f => f.endsWith('.mp3')).length === 0) {
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
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
