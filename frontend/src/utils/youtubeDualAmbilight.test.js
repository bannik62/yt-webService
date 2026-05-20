import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP,
  AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP_FULLSCREEN,
  AMBILIGHT_CINEMA_VIDEO_RATIO_MOBILE,
  AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH,
  AMBILIGHT_PLAYER_HEIGHT,
  ambilightPlayerVars,
  computeCinemaVideoRect,
  ensureAmbilightPlaying,
  getCinemaVideoRatio,
  setAmbilightPlaybackQuality,
} from './youtubeDualAmbilight.js';

const H = AMBILIGHT_PLAYER_HEIGHT;
const PS = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

describe('youtubeDualAmbilight', () => {
  beforeEach(() => {
    window.YT = { PlayerState: PS };
  });

  it('vars du lecteur fond sont muets et sans contrôles', () => {
    const v = ambilightPlayerVars();
    expect(v.mute).toBe(1);
    expect(v.controls).toBe(0);
  });

  it('hauteur cible plafonnée à 360px', () => {
    expect(H).toBe(360);
  });

  it('choisit medium en priorité', () => {
    const calls = [];
    setAmbilightPlaybackQuality({
      getAvailableQualityLevels: () => ['hd720', 'medium', 'small'],
      setPlaybackQuality: (q) => calls.push(q),
    });
    expect(calls[0]).toBe('medium');
  });

  it('met en pause le fond quand le principal est terminé', () => {
    const pauseVideo = vi.fn();
    ensureAmbilightPlaying(
      { getPlayerState: () => PS.ENDED, getCurrentTime: () => 286 },
      { getPlayerState: () => PS.PLAYING, getCurrentTime: () => 286, pauseVideo }
    );
    expect(pauseVideo).toHaveBeenCalled();
  });

  it('relance le fond quand le principal joue', () => {
    const playVideo = vi.fn();
    ensureAmbilightPlaying(
      { getPlayerState: () => PS.PLAYING, getCurrentTime: () => 12 },
      { getPlayerState: () => PS.PAUSED, getCurrentTime: () => 12, playVideo }
    );
    expect(playVideo).toHaveBeenCalled();
  });

  it('cinéma mobile : vidéo ~70 % du viewport', () => {
    const r = computeCinemaVideoRect(400, 800, AMBILIGHT_CINEMA_VIDEO_RATIO_MOBILE);
    expect(r.width).toBe(280);
    expect(r.height).toBe(158);
  });

  it('cinéma desktop : vidéo ~65 % du viewport', () => {
    const r = computeCinemaVideoRect(1000, 800, AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP);
    expect(r.width).toBe(650);
    expect(r.height).toBe(366);
    expect(r.left).toBe(175);
  });

  it('getCinemaVideoRatio choisit 65 % desktop, 70 % si plein écran navigateur', () => {
    expect(getCinemaVideoRatio(AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH, false)).toBe(0.65);
    expect(
      getCinemaVideoRatio(
        AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH,
        true
      )
    ).toBe(AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP_FULLSCREEN);
    expect(getCinemaVideoRatio(AMBILIGHT_CINEMA_DESKTOP_MIN_WIDTH - 1, false)).toBe(
      0.7
    );
  });

  it('cinéma desktop plein écran navigateur : vidéo ~70 %', () => {
    const r = computeCinemaVideoRect(
      1000,
      800,
      AMBILIGHT_CINEMA_VIDEO_RATIO_DESKTOP_FULLSCREEN
    );
    expect(r.width).toBe(700);
    expect(r.height).toBe(394);
  });
});
