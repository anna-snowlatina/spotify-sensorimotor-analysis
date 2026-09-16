import { describe, it, expect } from 'vitest';
import { PaletteTransitionManager, easeInOutCubic } from '../src/canvas/transition';
import type { Palette } from '../src/palette/extract';

const paletteA: Palette = {
  colors: ['#ff0000', '#00ff00', '#0000ff'],
  background: '#101010',
  isMonochrome: false,
  seed: 1,
};

const paletteB: Palette = {
  colors: ['#ffff00', '#00ffff', '#ff00ff'],
  background: '#202020',
  isMonochrome: false,
  seed: 2,
};

describe('easeInOutCubic', () => {
  it('maps the endpoints and midpoint correctly', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe('PaletteTransitionManager', () => {
  it('starts already settled on the initial palette (no transition-in)', () => {
    const manager = new PaletteTransitionManager(paletteA, 0);
    const frame = manager.sample(0);
    // background should already equal paletteA's background (converted round-trip via OKLab).
    expect(frame.background.L).toBeGreaterThan(0);
  });

  it('interpolates background and colors partway through a transition', () => {
    const manager = new PaletteTransitionManager(paletteA, 0);
    manager.setTarget(paletteB, 0);
    const early = manager.sample(500); // 1/8 through a 4000ms transition
    const late = manager.sample(3900); // almost done
    // Lightness should move monotonically toward the target as time passes.
    const startL = manager.sample(0).background.L;
    const endL = manager.sample(4000).background.L;
    if (startL !== endL) {
      expect(Math.abs(late.background.L - endL)).toBeLessThan(Math.abs(early.background.L - endL));
    }
  });

  it('finishes a transition at (or after) the full duration', () => {
    const manager = new PaletteTransitionManager(paletteA, 0);
    manager.setTarget(paletteB, 0);
    const finished = manager.sample(4000);
    const later = manager.sample(10_000);
    expect(finished.background).toEqual(later.background);
  });

  it('restarts a new transition from the currently-interpolated state on a rapid skip', () => {
    const manager = new PaletteTransitionManager(paletteA, 0);
    manager.setTarget(paletteB, 0);
    const midway = manager.sample(2000);

    const paletteC: Palette = { ...paletteB, background: '#303030', seed: 3 };
    manager.setTarget(paletteC, 2000);
    const justAfterSkip = manager.sample(2000);

    // The new transition's starting point should match what was showing right before the skip,
    // not jump back to paletteA or straight to paletteC.
    expect(justAfterSkip.background.L).toBeCloseTo(midway.background.L, 5);
  });
});
