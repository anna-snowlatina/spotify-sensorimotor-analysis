import { mulberry32 } from '../palette/kmeans';
import type { TransitionFrame } from './transition';
import { oklabToHex } from '../palette/oklab';

export const MIN_PARTICLES = 500;
export const MAX_PARTICLES = 4000;
export const PARTICLES_PER_PX_AREA = 1800;

export function particleCountFor(width: number, height: number): number {
  const count = Math.round((width * height) / PARTICLES_PER_PX_AREA);
  return Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, count));
}

export type ParticleField = {
  x: Float32Array;
  y: Float32Array;
  colorIndex: Uint8Array;
  count: number;
};

/** Rebuilds particle buffers (e.g. on resize or particle-count throttling). Positions are re-randomized. */
export function createParticleField(count: number, width: number, height: number, seed: number): ParticleField {
  const rand = mulberry32(seed);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const colorIndex = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = rand() * width;
    y[i] = rand() * height;
  }
  return { x, y, colorIndex, count };
}

/** Weighted random palette-slot assignment: earlier (higher-scored) colors are picked more often. */
export function assignParticleColors(field: ParticleField, numColors: number, seed: number): void {
  if (numColors === 0) return;
  const rand = mulberry32(seed ^ 0x1234abcd);
  const weights = Array.from({ length: numColors }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < field.count; i++) {
    let target = rand() * total;
    let chosen = numColors - 1;
    for (let c = 0; c < numColors; c++) {
      target -= weights[c];
      if (target <= 0) {
        chosen = c;
        break;
      }
    }
    field.colorIndex[i] = chosen;
  }
}

const NOISE_FREQ = 0.0015;
const SEGMENT_LENGTH = 6;

/**
 * Advances and draws every particle for one frame. Allocation-light: reuses the field's typed
 * arrays and precomputes one rgba string per palette slot (not per particle) per call.
 */
export function stepAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  field: ParticleField,
  width: number,
  height: number,
  frame: TransitionFrame,
  timeSeconds: number,
  speedPxPerSec: number,
  alpha: number,
): void {
  const colorStrings = frame.colors.map((c) => {
    const hex = oklabToHex(c);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  });
  if (colorStrings.length === 0) return;

  ctx.lineWidth = 1.2;

  for (let i = 0; i < field.count; i++) {
    const nx = field.x[i] * NOISE_FREQ;
    const ny = field.y[i] * NOISE_FREQ;
    const angle = frame.sampleNoise(nx, ny, timeSeconds) * Math.PI;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    ctx.strokeStyle = colorStrings[field.colorIndex[i] % colorStrings.length];
    ctx.beginPath();
    ctx.moveTo(field.x[i], field.y[i]);
    ctx.lineTo(field.x[i] + dx * SEGMENT_LENGTH, field.y[i] + dy * SEGMENT_LENGTH);
    ctx.stroke();

    field.x[i] += dx * speedPxPerSec;
    field.y[i] += dy * speedPxPerSec;

    if (field.x[i] < 0) field.x[i] += width;
    else if (field.x[i] > width) field.x[i] -= width;
    if (field.y[i] < 0) field.y[i] += height;
    else if (field.y[i] > height) field.y[i] -= height;
  }
}
