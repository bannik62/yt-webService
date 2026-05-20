import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AMBILIGHT_PLAYER_HEIGHT,
  ambilightPlayerVars,
  ensureAmbilightPlaying,
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
});
