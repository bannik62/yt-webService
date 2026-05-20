/**
 * Ambilight dual iframe (style brunos3d/video-ambilight) — sync + qualité basse.
 */

/** Hauteur max du lecteur fond (bande passante). */
export const AMBILIGHT_PLAYER_HEIGHT = 360;

/** @type {readonly string[]} qualités préférées (medium ≈ 360p) */
const PREFERRED_QUALITIES = ['medium', 'small', 'large'];

/** Marge autour du lecteur pour le halo visible (fraction de la taille vidéo). */
export const AMBILIGHT_BLEED_RATIO = 0.42;

export const AMBILIGHT_PREF_KEY = 'ytripper.ambilight.enabled';

const yt = () => window.YT;

/**
 * @param {YT.Player} player
 */
export function muteAmbilightPlayer(player) {
  try {
    player.mute?.();
  } catch {
    /* ignore */
  }
}

/**
 * Qualité ~360p si dispo.
 * @param {YT.Player} player
 */
export function setAmbilightPlaybackQuality(player) {
  try {
    const levels = player.getAvailableQualityLevels?.() || [];
    if (!levels.length) return;
    for (const q of PREFERRED_QUALITIES) {
      if (levels.includes(q)) {
        player.setPlaybackQuality(q);
        return;
      }
    }
    const fallback = levels.filter((l) => l && l !== 'auto').pop();
    if (fallback) player.setPlaybackQuality(fallback);
  } catch {
    /* ignore */
  }
}

/**
 * Taille iframe = zone visible (plafonnée pour limiter la data).
 * @param {YT.Player} player
 * @param {DOMRectReadOnly | { width: number, height: number }} rect
 */
export function setAmbilightPlayerSize(player, rect) {
  const h = Math.min(AMBILIGHT_PLAYER_HEIGHT, Math.max(180, Math.round(rect.height)));
  const w = Math.min(640, Math.max(320, Math.round(rect.width)));
  try {
    player.setSize?.(w, h);
  } catch {
    /* ignore */
  }
}

/**
 * @param {YT.Player} main
 * @param {YT.Player} back
 */
export function syncAmbilightTime(main, back) {
  try {
    const t = main.getCurrentTime?.() ?? 0;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return;
    const bt = back.getCurrentTime?.() ?? 0;
    if (Math.abs(bt - t) > 0.35) {
      back.seekTo(t, true);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Force la lecture du fond si le principal joue.
 * @param {YT.Player} main
 * @param {YT.Player} back
 */
export function ensureAmbilightPlaying(main, back) {
  const Y = yt();
  if (!Y?.PlayerState) return;
  try {
    const mainSt = main.getPlayerState?.();
    const backSt = back.getPlayerState?.();
    if (
      mainSt === Y.PlayerState.PLAYING ||
      mainSt === Y.PlayerState.BUFFERING
    ) {
      syncAmbilightTime(main, back);
      if (
        backSt !== Y.PlayerState.PLAYING &&
        backSt !== Y.PlayerState.BUFFERING
      ) {
        back.playVideo?.();
      }
    } else if (mainSt === Y.PlayerState.PAUSED) {
      syncAmbilightTime(main, back);
      if (backSt === Y.PlayerState.PLAYING) {
        back.pauseVideo?.();
      }
    } else if (mainSt === Y.PlayerState.ENDED) {
      syncAmbilightTime(main, back);
      if (backSt === Y.PlayerState.PLAYING) {
        back.pauseVideo?.();
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {YT.Player} main
 * @param {YT.Player} back
 */
export function syncAmbilightState(main, back) {
  ensureAmbilightPlaying(main, back);
  setAmbilightPlaybackQuality(back);
}

/**
 * Boucle de sync : temps + lecture forcée du fond.
 * @param {YT.Player} main
 * @param {YT.Player} back
 * @returns {() => void}
 */
export function startAmbilightSyncLoop(main, back) {
  let raf = 0;
  let last = 0;

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 80) return;
    last = now;
    ensureAmbilightPlaying(main, back);
  };

  raf = requestAnimationFrame(tick);

  const interval = window.setInterval(() => {
    ensureAmbilightPlaying(main, back);
  }, 400);

  return () => {
    cancelAnimationFrame(raf);
    window.clearInterval(interval);
  };
}

/** Vars iframe fond : muet, sans UI. */
export function ambilightPlayerVars() {
  return {
    autoplay: 1,
    controls: 0,
    disablekb: 1,
    fs: 0,
    iv_load_policy: 3,
    modestbranding: 1,
    playsinline: 1,
    rel: 0,
    mute: 1,
  };
}
