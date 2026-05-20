/**
 * Ambilight depuis la miniature YouTube — pas de partage d’onglet (pas de cadre bleu Chrome).
 */

const SAMPLE_W = 80;
const SAMPLE_H = 45;

/**
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @param {'top' | 'bottom' | 'left' | 'right'} edge
 * @param {number} thickness
 */
export function averageEdgeColor(data, w, h, edge, thickness = 3) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  const add = (x, y) => {
    const i = (y * w + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  };

  if (edge === 'top') {
    for (let y = 0; y < thickness; y++) {
      for (let x = 0; x < w; x++) add(x, y);
    }
  } else if (edge === 'bottom') {
    for (let y = h - thickness; y < h; y++) {
      for (let x = 0; x < w; x++) add(x, y);
    }
  } else if (edge === 'left') {
    for (let x = 0; x < thickness; x++) {
      for (let y = 0; y < h; y++) add(x, y);
    }
  } else {
    for (let x = w - thickness; x < w; x++) {
      for (let y = 0; y < h; y++) add(x, y);
    }
  }

  if (!n) return 'rgba(0, 0, 0, 0)';
  let rr = Math.round(r / n);
  let gg = Math.round(g / n);
  let bb = Math.round(b / n);
  const max = Math.max(rr, gg, bb);
  if (max < 28) {
    rr = 48;
    gg = 72;
    bb = 128;
  } else if (max < 100) {
    const f = 130 / max;
    rr = Math.min(255, Math.round(rr * f));
    gg = Math.min(255, Math.round(gg * f));
    bb = Math.min(255, Math.round(bb * f));
  }
  return `rgba(${rr}, ${gg}, ${bb}, 0.92)`;
}

/**
 * @param {HTMLElement} el
 * @param {Record<string, string>} vars
 */
function applyAmbVars(el, vars) {
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value);
  }
}

/**
 * @param {HTMLElement} el
 */
function clearAmbVars(el) {
  el.classList.remove('has-ambient-light');
  for (const side of ['top', 'bottom', 'left', 'right']) {
    el.style.removeProperty(`--amb-${side}`);
  }
}

/**
 * Halo coloré autour de `.video-container` (modal) ou dock, via miniature.
 */
export class ThumbnailAmbientLight {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.glowEl
   */
  constructor({ glowEl }) {
    this.glowEl = glowEl;
    this._active = false;
    this._loadGen = 0;
  }

  get isActive() {
    return this._active;
  }

  /**
   * @param {HTMLElement} el
   */
  setGlowEl(el) {
    if (el === this.glowEl) return;
    if (this._active) clearAmbVars(this.glowEl);
    this.glowEl = el;
    if (this._active) this.glowEl.classList.add('has-ambient-light');
  }

  stop() {
    this._loadGen += 1;
    this._active = false;
    clearAmbVars(this.glowEl);
  }

  /**
   * @param {string} thumbnailUrl
   * @returns {Promise<boolean>}
   */
  async applyFromThumbnail(thumbnailUrl) {
    if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return false;

    const gen = ++this._loadGen;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return false;
      }
    } catch {
      /* ignore */
    }

    try {
      const vars = await this._sampleThumbnail(thumbnailUrl);
      if (gen !== this._loadGen) return false;
      applyAmbVars(this.glowEl, vars);
      this.glowEl.classList.add('has-ambient-light');
      this._active = true;
      return true;
    } catch {
      if (gen === this._loadGen) this.stop();
      return false;
    }
  }

  /**
   * @param {string} url
   * @returns {Promise<Record<string, string>>}
   */
  _sampleThumbnail(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = SAMPLE_W;
          canvas.height = SAMPLE_H;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            reject(new Error('canvas'));
            return;
          }
          ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
          const data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
          resolve({
            '--amb-top': averageEdgeColor(data, SAMPLE_W, SAMPLE_H, 'top'),
            '--amb-bottom': averageEdgeColor(data, SAMPLE_W, SAMPLE_H, 'bottom'),
            '--amb-left': averageEdgeColor(data, SAMPLE_W, SAMPLE_H, 'left'),
            '--amb-right': averageEdgeColor(data, SAMPLE_W, SAMPLE_H, 'right'),
          });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('thumbnail load'));
      img.src = url;
    });
  }
}

/** sessionStorage : absent ou '1' = activé, '0' = désactivé */
export const AMBILIGHT_PREF_KEY = 'ytripper.ambilight.enabled';
