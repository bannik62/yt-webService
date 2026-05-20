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

/** Part de l’écran : mobile 70 % / desktop 65 % / desktop + plein écran navigateur 70 %. */
export const AMBILIGHT_CINEMA_VIDEO_RATIO_MOBILE = 0.7;
export const AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP = 0.65;
export const AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP_FULLSCREEN = 0.7;

/** @deprecated utiliser getCinemaVideoRatio() */
export const AMBILIGHT_CINEMA_VIDEO_RATIO = AMBILIGHT_CINEMA_VIDEO_RATIO_MOBILE;

/** Aligné sur le breakpoint desktop du projet (769px). */
export const AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH = 769;

/**
 * Plein écran navigateur actif (F11 / bouton full screen).
 */
export function isBrowserFullscreen() {
  const doc = document;
  return Boolean(
    doc.fullscreenElement ??
      /** @type {Document & { webkitFullscreenElement?: Element }} */ (doc)
        .webkitFullscreenElement
  );
}

/**
 * Ratio vidéo mode cinéma (desktop 70 % si plein écran navigateur).
 * @param {number} [vw]
 * @param {boolean} [fullscreen]
 */
export function getCinemaVideoRatio(
  vw = window.innerWidth,
  fullscreen = isBrowserFullscreen()
) {
  if (vw < AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH) {
    return AMBILIGHT_CINEMA_VIDEO_RATIO_MOBILE;
  }
  if (fullscreen) {
    return AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP_FULLSCREEN;
  }
  return AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP;
}

/**
 * Rectangle 16:9 centré (ratio responsive desktop / mobile).
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
export function computeCinemaVideoRect(
  vw = window.innerWidth,
  vh = window.innerHeight,
  ratio = getCinemaVideoRatio(vw)
) {
  const maxW = vw * ratio;
  const maxH = vh * ratio;
  let w = maxW;
  let h = (w * 9) / 16;
  if (h > maxH) {
    h = maxH;
    w = (h * 16) / 9;
  }
  return {
    left: Math.round((vw - w) / 2),
    top: Math.round((vh - h) / 2),
    width: Math.round(w),
    height: Math.round(h),
  };
}

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
