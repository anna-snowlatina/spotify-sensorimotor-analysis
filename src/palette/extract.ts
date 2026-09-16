import { rgbToOklab, oklabChroma, oklabDistance, oklabToHex, type Oklab } from './oklab';
import { kMeans } from './kmeans';

export type Palette = {
  colors: string[]; // 3-5 accents, sorted by score, as hex
  background: string; // darkest meaningful cluster, pushed to L≈0.12-0.18
  isMonochrome: boolean; // max chroma below threshold
  seed: number; // hash of id, reused by the canvas
};

export type PixelSource = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

const K = 6;
const MAX_ITERATIONS = 10;
const MERGE_THRESHOLD = 0.04; // ΔE_ok
const MONOCHROME_CHROMA_THRESHOLD = 0.02;
const MIN_MEANINGFUL_POPULATION_SHARE = 0.02;
const BACKGROUND_L_MIN = 0.12;
const BACKGROUND_L_MAX = 0.18;

export const NEUTRAL_PALETTE: Palette = {
  colors: ['#4a5568', '#5b6b82', '#3d4a5c'],
  background: '#14161a',
  isMonochrome: true,
  seed: 0,
};

/** FNV-1a 32-bit hash, deterministic across runs. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

type ScoredCluster = { color: Oklab; population: number; score: number };

function mergeCloseClusters(clusters: ScoredCluster[]): ScoredCluster[] {
  const merged = [...clusters];
  let didMerge = true;

  while (didMerge) {
    didMerge = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (oklabDistance(merged[i].color, merged[j].color) < MERGE_THRESHOLD) {
          const totalPop = merged[i].population + merged[j].population;
          const weightedColor: Oklab = {
            L: (merged[i].color.L * merged[i].population + merged[j].color.L * merged[j].population) / totalPop,
            a: (merged[i].color.a * merged[i].population + merged[j].color.a * merged[j].population) / totalPop,
            b: (merged[i].color.b * merged[i].population + merged[j].color.b * merged[j].population) / totalPop,
          };
          merged.splice(j, 1);
          merged.splice(i, 1);
          merged.push({
            color: weightedColor,
            population: totalPop,
            score: totalPop * (0.3 + oklabChroma(weightedColor)),
          });
          didMerge = true;
          break outer;
        }
      }
    }
  }

  return merged;
}

/** Pure extraction over already-decoded pixel data. No DOM dependency, so this is directly testable. */
export function extractPalette(pixels: PixelSource, seedId: string): Palette {
  const seed = hashString(seedId);
  const points: number[][] = [];
  const { data } = pixels;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue; // skip transparent pixels
    const lab = rgbToOklab({ r: data[i], g: data[i + 1], b: data[i + 2] });
    points.push([lab.L, lab.a, lab.b]);
  }

  if (points.length === 0) return NEUTRAL_PALETTE;

  const clusters = kMeans(points, K, seed, MAX_ITERATIONS);
  const totalPoints = points.length;

  let scored: ScoredCluster[] = clusters
    .filter((c) => c.memberIndices.length > 0)
    .map((c) => {
      const color: Oklab = { L: c.centroid[0], a: c.centroid[1], b: c.centroid[2] };
      const population = c.memberIndices.length;
      return { color, population, score: population * (0.3 + oklabChroma(color)) };
    });

  scored = mergeCloseClusters(scored);
  scored.sort((a, b) => b.score - a.score);

  const maxChroma = Math.max(...scored.map((c) => oklabChroma(c.color)));
  const isMonochrome = maxChroma < MONOCHROME_CHROMA_THRESHOLD;

  const meaningful = scored.filter((c) => c.population / totalPoints >= MIN_MEANINGFUL_POPULATION_SHARE);
  const darkest = (meaningful.length > 0 ? meaningful : scored).reduce((a, b) => (a.color.L <= b.color.L ? a : b));

  const targetL = Math.min(BACKGROUND_L_MAX, Math.max(BACKGROUND_L_MIN, darkest.color.L));
  const background: Oklab = isMonochrome
    ? { L: targetL, a: 0, b: 0 }
    : { L: targetL, a: darkest.color.a, b: darkest.color.b };

  const accentColors = isMonochrome
    ? NEUTRAL_PALETTE.colors
    : scored.slice(0, 5).length >= 3
      ? scored.slice(0, 5).map((c) => oklabToHex(c.color))
      : scored.map((c) => oklabToHex(c.color));

  return {
    colors: accentColors,
    background: oklabToHex(background),
    isMonochrome,
    seed,
  };
}

/**
 * Loads the image, draws it to an offscreen 64x64 canvas, and extracts a palette from the
 * resulting pixels. Returns null (caller should fall back to NEUTRAL_PALETTE) if the image
 * fails to load or the canvas comes out tainted (missing CORS headers) — never proxies images
 * through a third-party service.
 */
export async function loadAndExtractPalette(imageUrl: string, seedId: string): Promise<Palette | null> {
  const SIZE = 64;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = imageUrl;
  });
  if (!img) return null;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, SIZE, SIZE);

  try {
    const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
    return extractPalette(imageData, seedId);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'SecurityError') return null;
    throw err;
  }
}
