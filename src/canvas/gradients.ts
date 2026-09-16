import { oklabToHex } from '../palette/oklab';
import type { TransitionFrame } from './transition';

export type GradientSpec = { phase: number; freqX: number; freqY: number; radiusFrac: number };

/** Deterministic per-song gradient drift parameters, derived from the palette seed. */
export function createGradientSpecs(seed: number, count: number): GradientSpec[] {
  const specs: GradientSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Simple deterministic pseudo-variation without pulling in a full RNG for just a few numbers.
    const h = ((seed + i * 2654435761) >>> 0) / 4294967296;
    specs.push({
      phase: h * Math.PI * 2,
      freqX: 0.7 + i * 0.23,
      freqY: 0.55 + i * 0.19,
      radiusFrac: 0.55 + (i % 2) * 0.15,
    });
  }
  return specs;
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Draws the background color plus 3-4 large, slowly drifting radial gradients in the palette's
 * accent colors. Redrawn fully opaque each frame (the flow field layer sits on a separate
 * transparent canvas on top, so this layer doesn't need to preserve trails).
 */
export function drawGradients(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: TransitionFrame,
  specs: GradientSpec[],
  timeSeconds: number,
  cycleSeconds: number,
): void {
  ctx.fillStyle = oklabToHex(frame.background);
  ctx.fillRect(0, 0, width, height);

  const t = (timeSeconds / cycleSeconds) * Math.PI * 2;
  const maxRadius = Math.max(width, height);

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const color = frame.colors[i % frame.colors.length];
    if (!color) continue;
    const cx = width * (0.5 + 0.35 * Math.sin(t * spec.freqX + spec.phase));
    const cy = height * (0.5 + 0.35 * Math.cos(t * spec.freqY + spec.phase));
    const radius = maxRadius * spec.radiusFrac;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, withAlpha(oklabToHex(color), 0.5));
    gradient.addColorStop(1, withAlpha(oklabToHex(color), 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}
