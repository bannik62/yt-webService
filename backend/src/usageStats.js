import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'usage-stats.json');

const RETENTION_DAYS = 30;
const MAX_EVENTS = 20_000;
/** Nombre max d’entrées renvoyées dans topVideos / topChannels. */
export const STATS_DISPLAY_LIMIT = 15;

/** @type {Promise<void>} */
let writeChain = Promise.resolve();

function statsPath() {
  const p = process.env.USAGE_STATS_PATH?.trim();
  return p && p.length > 0 ? p : DEFAULT_PATH;
}

/**
 * @returns {Promise<{ updatedAt: string, events: object[], dedup: Record<string, 1> }>}
 */
async function readStoreUnlocked() {
  try {
    const raw = await fs.readFile(statsPath(), 'utf8');
    const j = JSON.parse(raw);
    return {
      updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : '',
      events: Array.isArray(j.events) ? j.events : [],
      dedup: j.dedup && typeof j.dedup === 'object' ? j.dedup : {}
    };
  } catch {
    return { updatedAt: '', events: [], dedup: {} };
  }
}

/**
 * @param {string} anonId
 * @param {string} videoId
 * @param {Date} [now]
 */
export function dedupKey(anonId, videoId, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `${anonId}:${videoId}:${day}`;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeAnonId(raw) {
  const t = String(raw ?? '').trim();
  if (t.length < 8 || t.length > 128) return '';
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) return '';
  return t;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeVideoId(raw) {
  const t = String(raw ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(t)) return '';
  return t;
}

/**
 * @param {unknown} raw
 * @param {number} max
 * @returns {string}
 */
function normalizeLabel(raw, max = 200) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeChannelId(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (t.length > 64) return '';
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) return '';
  return t;
}

/**
 * @param {{
 *   type?: string,
 *   anonId?: string,
 *   videoId?: string,
 *   channelId?: string,
 *   channelName?: string,
 *   title?: string
 * }} payload
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateUsageEvent(payload) {
  const type = String(payload?.type ?? '').trim();
  if (type !== 'video_view') {
    return { ok: false, error: 'type invalide (video_view attendu)' };
  }
  const anonId = normalizeAnonId(payload?.anonId);
  if (!anonId) return { ok: false, error: 'anonId invalide' };
  const videoId = normalizeVideoId(payload?.videoId);
  if (!videoId) return { ok: false, error: 'videoId invalide' };
  return { ok: true };
}

/**
 * Enregistre une vue vidéo (1 par anonId / vidéo / jour).
 * @param {{
 *   anonId: string,
 *   videoId: string,
 *   channelId?: string,
 *   channelName?: string,
 *   title?: string
 * }} evt
 * @returns {Promise<{ recorded: boolean }>}
 */
export function recordUsageEvent(evt) {
  writeChain = writeChain
    .then(() => recordUsageEventUnlocked(evt))
    .catch((err) => {
      console.error('[usageStats]', err);
      return { recorded: false };
    });
  return writeChain;
}

/**
 * @param {object} evt
 */
async function recordUsageEventUnlocked(evt) {
  const anonId = normalizeAnonId(evt.anonId);
  const videoId = normalizeVideoId(evt.videoId);
  if (!anonId || !videoId) return { recorded: false };

  const now = new Date();
  const key = dedupKey(anonId, videoId, now);
  const filePath = statsPath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  let store = await readStoreUnlocked();
  if (store.dedup[key]) return { recorded: false };

  store.events.push({
    at: now.toISOString(),
    type: 'video_view',
    anonId,
    videoId,
    channelId: normalizeChannelId(evt.channelId),
    channelName: normalizeLabel(evt.channelName),
    title: normalizeLabel(evt.title)
  });
  store.dedup[key] = 1;
  store = pruneStore(store, now);
  store.updatedAt = now.toISOString();

  await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  return { recorded: true };
}

/**
 * @param {object} store
 * @param {Date} now
 */
function pruneStore(store, now) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffMs = cutoff.getTime();

  store.events = store.events.filter((e) => {
    const t = Date.parse(String(e?.at ?? ''));
    return Number.isFinite(t) && t >= cutoffMs;
  });
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }

  const dedupCutoffDay = new Date(now);
  dedupCutoffDay.setUTCDate(dedupCutoffDay.getUTCDate() - 2);
  const dedupCutoff = dedupCutoffDay.toISOString().slice(0, 10);
  const nextDedup = {};
  for (const [k, v] of Object.entries(store.dedup)) {
    const day = k.split(':').pop();
    if (day && day >= dedupCutoff) nextDedup[k] = v;
  }
  store.dedup = nextDedup;
  return store;
}

/**
 * Agrégats anonymes sur les N derniers jours.
 * @param {{ days?: number, limit?: number }} [opts]
 */
export async function getUsageStatsSummary(opts = {}) {
  const daysRaw = Number(opts.days);
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(90, Math.floor(daysRaw)) : 7;
  const limitRaw = Number(opts.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(STATS_DISPLAY_LIMIT, Math.floor(limitRaw))
      : STATS_DISPLAY_LIMIT;

  const store = await readStoreUnlocked();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffMs = cutoff.getTime();

  /** @type {Map<string, { videoId: string, title: string, channelName: string, views: number, anonSet: Set<string> }>} */
  const videos = new Map();
  /** @type {Map<string, { channelId: string, channelName: string, views: number, anonSet: Set<string> }>} */
  const channels = new Map();

  for (const e of store.events) {
    if (e?.type !== 'video_view') continue;
    const t = Date.parse(String(e.at ?? ''));
    if (!Number.isFinite(t) || t < cutoffMs) continue;

    const videoId = normalizeVideoId(e.videoId);
    const anonId = normalizeAnonId(e.anonId);
    if (!videoId || !anonId) continue;

    let v = videos.get(videoId);
    if (!v) {
      v = {
        videoId,
        title: normalizeLabel(e.title) || videoId,
        channelName: normalizeLabel(e.channelName),
        views: 0,
        anonSet: new Set()
      };
      videos.set(videoId, v);
    }
    v.views += 1;
    v.anonSet.add(anonId);
    if (!v.title || v.title === videoId) {
      const tTitle = normalizeLabel(e.title);
      if (tTitle) v.title = tTitle;
    }
    const cName = normalizeLabel(e.channelName);
    if (cName) v.channelName = cName;

    const channelId = normalizeChannelId(e.channelId) || normalizeLabel(e.channelName) || 'unknown';
    let c = channels.get(channelId);
    if (!c) {
      c = {
        channelId,
        channelName: normalizeLabel(e.channelName) || channelId,
        views: 0,
        anonSet: new Set()
      };
      channels.set(channelId, c);
    }
    c.views += 1;
    c.anonSet.add(anonId);
    const chName = normalizeLabel(e.channelName);
    if (chName) c.channelName = chName;
  }

  const sortedVideos = [...videos.values()].sort(
    (a, b) => b.views - a.views || b.anonSet.size - a.anonSet.size
  );
  const sortedChannels = [...channels.values()].sort(
    (a, b) => b.views - a.views || b.anonSet.size - a.anonSet.size
  );

  const totalVideos = sortedVideos.length;
  const totalChannels = sortedChannels.length;

  const topVideos = sortedVideos.slice(0, limit).map((v) => ({
    videoId: v.videoId,
    title: v.title,
    channelName: v.channelName,
    views: v.views,
    uniqueViewers: v.anonSet.size
  }));

  const topChannels = sortedChannels.slice(0, limit).map((c) => ({
    channelId: c.channelId,
    channelName: c.channelName,
    views: c.views,
    uniqueViewers: c.anonSet.size
  }));

  return {
    periodDays: days,
    displayLimit: limit,
    totalEvents: store.events.filter((e) => {
      const t = Date.parse(String(e?.at ?? ''));
      return Number.isFinite(t) && t >= cutoffMs;
    }).length,
    totalVideos,
    totalChannels,
    videosNotShown: Math.max(0, totalVideos - topVideos.length),
    channelsNotShown: Math.max(0, totalChannels - topChannels.length),
    topVideos,
    topChannels,
    updatedAt: store.updatedAt || new Date().toISOString()
  };
}
