export const REF_BPM = 120;
export const DEFAULT_BPM = 100;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Perceptual compression so 60 vs 180 BPM differ clearly but not absurdly. */
export function paceFactor(bpm: number): number {
  return clamp(Math.pow(bpm / REF_BPM, 0.8), 0.5, 1.8);
}

export function beatPeriodSec(bpm: number): number {
  return 60 / bpm;
}

const MIN_GRADIENT_CYCLE_SEC = 30;
const MAX_GRADIENT_CYCLE_SEC = 110;
const GRADIENT_CYCLE_BEATS = 96;

/** 96 beats per gradient cycle (48s at 120 BPM, 72s at 80 BPM), clamped to 30-110s. */
export function gradientCycleSeconds(bpm: number): number {
  return clamp(GRADIENT_CYCLE_BEATS * beatPeriodSec(bpm), MIN_GRADIENT_CYCLE_SEC, MAX_GRADIENT_CYCLE_SEC);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cubic ease-in-out, duplicated from canvas/transition.ts to keep src/tempo/ dependency-free. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Interpolates between two BPM values in log space (perceptually linear) with ease-in-out. */
export function interpolateBpmLog(a: number, b: number, t: number): number {
  const eased = easeInOutCubic(clamp(t, 0, 1));
  return Math.exp(lerp(Math.log(a), Math.log(b), eased));
}

const BREATH_PERIOD_BEATS = 4;
const BREATH_SPEED_AMPLITUDE = 0.08;
const BREATH_ALPHA_AMPLITUDE = 0.05;

/** A soft periodic "breath": speed *(1 ± 0.08), particle alpha *(1 ± 0.05), period = 4 beats. */
export function breathMultipliers(phaseFraction: number): { speed: number; alpha: number } {
  const s = Math.sin(phaseFraction * Math.PI * 2);
  return {
    speed: 1 + s * BREATH_SPEED_AMPLITUDE,
    alpha: 1 + s * BREATH_ALPHA_AMPLITUDE,
  };
}

export function breathPhaseIncrement(dtSeconds: number, bpm: number): number {
  return dtSeconds / (BREATH_PERIOD_BEATS * beatPeriodSec(bpm));
}

const MAX_ENERGY_EFFECT = 0.2;

/** energy 0 -> longer/sparser trails (factor > 1), energy 1 -> shorter/denser (factor < 1). Kept subtle (±20%). */
export function energyTrailFactor(energy: number | undefined): number {
  if (energy === undefined) return 1;
  return 1 + (0.5 - clamp(energy, 0, 1)) * 2 * MAX_ENERGY_EFFECT;
}

const MAX_VALENCE_LIGHTNESS_SHIFT = 0.04;

/** Optional ±4% lightness shift of the gradient layer only, off by default. */
export function valenceLightnessShift(valence: number | undefined): number {
  if (valence === undefined) return 0;
  return (clamp(valence, 0, 1) - 0.5) * 2 * MAX_VALENCE_LIGHTNESS_SHIFT;
}

const BPM_TRANSITION_DURATION_MS = 4000;

/**
 * Crossfades BPM in log space over 4s, the same "restart from whatever's currently interpolated"
 * pattern as the palette transition — so a rapid skip never causes a jump, and an unknown tempo
 * (DEFAULT_BPM) that later resolves just eases again from wherever the default settled.
 */
export class BpmTransitionManager {
  private fromBpm: number;
  private toBpm: number;
  private startedAt: number;

  constructor(initialBpm: number, now: number) {
    this.fromBpm = initialBpm;
    this.toBpm = initialBpm;
    this.startedAt = now - BPM_TRANSITION_DURATION_MS;
  }

  private progress(now: number): number {
    return clamp((now - this.startedAt) / BPM_TRANSITION_DURATION_MS, 0, 1);
  }

  setTarget(nextBpm: number, now: number): void {
    const current = this.sample(now);
    this.fromBpm = current;
    this.toBpm = nextBpm;
    this.startedAt = now;
  }

  sample(now: number): number {
    return interpolateBpmLog(this.fromBpm, this.toBpm, this.progress(now));
  }
}
