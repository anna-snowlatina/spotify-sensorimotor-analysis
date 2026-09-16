import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { rgbToOklab, oklabToHex, type Oklab } from '../palette/oklab';
import { mulberry32 } from '../palette/kmeans';
import type { Palette } from '../palette/extract';

function hexToOklab(hex: string): Oklab {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return rgbToOklab({ r, g, b });
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpOklab(a: Oklab, b: Oklab, t: number): Oklab {
  return { L: lerp(a.L, b.L, t), a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t) };
}

/** Cubic ease-in-out. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const TRANSITION_DURATION_MS = 4000;

/** A momentary snapshot of the visuals: interpolated palette (as OKLab) and a noise sampler. */
export type TransitionFrame = {
  background: Oklab;
  colors: Oklab[];
  /** Blended noise sample in [-1, 1] for a given (x, y, t). */
  sampleNoise: (x: number, y: number, t: number) => number;
};

/**
 * Manages crossfading from one song's palette+noise-field to the next over
 * TRANSITION_DURATION_MS, in OKLab, with ease-in-out. Never respawns particles — only the
 * color and noise sampling change. If a new palette arrives mid-transition, the new transition
 * starts from whatever was currently interpolated, not from scratch.
 */
export class PaletteTransitionManager {
  private fromColors: Oklab[];
  private toColors: Oklab[];
  private fromBackground: Oklab;
  private toBackground: Oklab;
  private noiseA: NoiseFunction3D;
  private noiseB: NoiseFunction3D;
  private startedAt: number;

  constructor(initial: Palette, now: number) {
    const colors = initial.colors.map(hexToOklab);
    const background = hexToOklab(initial.background);
    this.fromColors = colors;
    this.toColors = colors;
    this.fromBackground = background;
    this.toBackground = background;
    this.noiseA = createNoise3D(mulberry32(initial.seed));
    this.noiseB = this.noiseA;
    this.startedAt = now - TRANSITION_DURATION_MS; // start already-settled
  }

  private progress(now: number): number {
    return Math.min(1, Math.max(0, (now - this.startedAt) / TRANSITION_DURATION_MS));
  }

  /** Call when the palette changes (new song). Freezes the current interpolated state as the new "from". */
  setTarget(next: Palette, now: number): void {
    const blend = easeInOutCubic(this.progress(now));
    const frame = this.sample(now);

    this.fromColors = frame.colors;
    this.fromBackground = frame.background;
    this.toColors = next.colors.map(hexToOklab);
    this.toBackground = hexToOklab(next.background);

    const prevNoiseA = this.noiseA;
    const prevNoiseB = this.noiseB;
    this.noiseA = (x: number, y: number, z: number) => lerp(prevNoiseA(x, y, z), prevNoiseB(x, y, z), blend);
    this.noiseB = createNoise3D(mulberry32(next.seed));
    this.startedAt = now;
  }

  sample(now: number): TransitionFrame {
    const blend = easeInOutCubic(this.progress(now));
    const n = Math.max(this.fromColors.length, this.toColors.length, 1);
    const colors = Array.from({ length: n }, (_, i) =>
      lerpOklab(
        this.fromColors[i % this.fromColors.length] ?? this.fromBackground,
        this.toColors[i % this.toColors.length] ?? this.toBackground,
        blend,
      ),
    );
    const background = lerpOklab(this.fromBackground, this.toBackground, blend);
    const noiseA = this.noiseA;
    const noiseB = this.noiseB;
    return {
      background,
      colors,
      sampleNoise: (x, y, t) => lerp(noiseA(x, y, t), noiseB(x, y, t), blend),
    };
  }
}

export function oklabColorsToHex(colors: Oklab[]): string[] {
  return colors.map(oklabToHex);
}
