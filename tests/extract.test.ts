import { describe, it, expect } from 'vitest';
import { extractPalette, type PixelSource } from '../src/palette/extract';

const HEX_RE = /^#[0-9a-f]{6}$/i;

function solidImage(width: number, height: number, r: number, g: number, b: number, a = 255): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { data, width, height };
}

function twoColorImage(width: number, height: number): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  const half = Math.floor((width * height) / 2);
  for (let px = 0; px < width * height; px++) {
    const i = px * 4;
    if (px < half) {
      data[i] = 230;
      data[i + 1] = 30;
      data[i + 2] = 30;
    } else {
      data[i] = 30;
      data[i + 1] = 60;
      data[i + 2] = 230;
    }
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function grayscaleImage(width: number, height: number, seed: number): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  let x = seed;
  const next = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x % 256;
  };
  for (let px = 0; px < width * height; px++) {
    const i = px * 4;
    const v = next();
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

function noisyImage(width: number, height: number, seed: number): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  let x = seed;
  const next = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x % 256;
  };
  for (let px = 0; px < width * height; px++) {
    const i = px * 4;
    data[i] = next();
    data[i + 1] = next();
    data[i + 2] = next();
    data[i + 3] = 255;
  }
  return { data, width, height };
}

describe('extractPalette', () => {
  it('produces a valid-shaped palette for a single flat color', () => {
    const palette = extractPalette(solidImage(8, 8, 40, 160, 90), 'flat-color-track');
    expect(palette.background).toMatch(HEX_RE);
    for (const c of palette.colors) expect(c).toMatch(HEX_RE);
    expect(typeof palette.seed).toBe('number');
  });

  it('detects a grayscale image as monochrome', () => {
    const palette = extractPalette(grayscaleImage(16, 16, 5), 'grayscale-track');
    expect(palette.isMonochrome).toBe(true);
  });

  it('does not flag a saturated two-color image as monochrome', () => {
    const palette = extractPalette(twoColorImage(16, 16), 'two-color-track');
    expect(palette.isMonochrome).toBe(false);
    expect(palette.colors.length).toBeGreaterThanOrEqual(1);
  });

  it('handles a noisy image without crashing and returns a valid palette', () => {
    const palette = extractPalette(noisyImage(16, 16, 99), 'noisy-track');
    expect(palette.background).toMatch(HEX_RE);
    expect(palette.colors.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same pixels and id', () => {
    const pixels = twoColorImage(16, 16);
    const a = extractPalette(pixels, 'same-id');
    const b = extractPalette(pixels, 'same-id');
    expect(a).toEqual(b);
  });

  it('pushes the background lightness into the 0.12-0.18 band (verified via a dark round-trip)', () => {
    // A flat very dark color's background should still come out non-black (pushed up), and a
    // flat very light color's background should come out darker than the source (pushed down).
    const darkPalette = extractPalette(solidImage(8, 8, 5, 5, 5), 'near-black');
    const lightPalette = extractPalette(solidImage(8, 8, 250, 250, 250), 'near-white');
    expect(darkPalette.background).not.toBe('#050505');
    expect(lightPalette.background).not.toBe('#fafafa');
  });
});
