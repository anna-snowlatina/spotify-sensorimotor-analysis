import { describe, it, expect } from 'vitest';
import { rgbToOklab, oklabToRgb, oklabChroma, oklabDistance, rgbToHex } from '../src/palette/oklab';

const SAMPLE_COLORS = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 128, g: 128, b: 128 },
  { r: 34, g: 139, b: 230 },
  { r: 200, g: 50, b: 180 },
];

describe('rgbToOklab / oklabToRgb round-trip', () => {
  for (const color of SAMPLE_COLORS) {
    it(`round-trips ${rgbToHex(color)} within 1 unit per channel`, () => {
      const lab = rgbToOklab(color);
      const back = oklabToRgb(lab);
      expect(Math.abs(back.r - color.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - color.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - color.b)).toBeLessThanOrEqual(1);
    });
  }
});

describe('oklabChroma', () => {
  it('is ~0 for grayscale colors', () => {
    expect(oklabChroma(rgbToOklab({ r: 128, g: 128, b: 128 }))).toBeCloseTo(0, 3);
    expect(oklabChroma(rgbToOklab({ r: 0, g: 0, b: 0 }))).toBeCloseTo(0, 3);
    expect(oklabChroma(rgbToOklab({ r: 255, g: 255, b: 255 }))).toBeCloseTo(0, 3);
  });

  it('is meaningfully positive for a saturated color', () => {
    expect(oklabChroma(rgbToOklab({ r: 255, g: 0, b: 0 }))).toBeGreaterThan(0.1);
  });
});

describe('oklabDistance', () => {
  it('is zero for identical colors', () => {
    const lab = rgbToOklab({ r: 100, g: 150, b: 200 });
    expect(oklabDistance(lab, lab)).toBe(0);
  });

  it('is larger for more different colors', () => {
    const black = rgbToOklab({ r: 0, g: 0, b: 0 });
    const gray = rgbToOklab({ r: 50, g: 50, b: 50 });
    const white = rgbToOklab({ r: 255, g: 255, b: 255 });
    expect(oklabDistance(black, white)).toBeGreaterThan(oklabDistance(black, gray));
  });
});
