import { describe, it, expect } from 'vitest';
import {
  paceFactor,
  beatPeriodSec,
  gradientCycleSeconds,
  interpolateBpmLog,
  breathMultipliers,
  energyTrailFactor,
  valenceLightnessShift,
  REF_BPM,
} from '../src/tempo/pace';

describe('paceFactor', () => {
  it('is 1 at the reference BPM', () => {
    expect(paceFactor(REF_BPM)).toBeCloseTo(1, 10);
  });

  it('is greater than 1 above the reference BPM and less than 1 below it', () => {
    expect(paceFactor(180)).toBeGreaterThan(1);
    expect(paceFactor(60)).toBeLessThan(1);
  });

  it('clamps to [0.5, 1.8] for extreme values', () => {
    expect(paceFactor(1)).toBeGreaterThanOrEqual(0.5);
    expect(paceFactor(1)).toBeCloseTo(0.5, 5);
    expect(paceFactor(1000)).toBeLessThanOrEqual(1.8);
    expect(paceFactor(1000)).toBeCloseTo(1.8, 5);
  });
});

describe('beatPeriodSec', () => {
  it('matches hand-computed values', () => {
    expect(beatPeriodSec(120)).toBeCloseTo(0.5, 10);
    expect(beatPeriodSec(60)).toBeCloseTo(1, 10);
  });
});

describe('gradientCycleSeconds', () => {
  it('is ~48s at 120 BPM and ~72s at 80 BPM', () => {
    expect(gradientCycleSeconds(120)).toBeCloseTo(48, 1);
    expect(gradientCycleSeconds(80)).toBeCloseTo(72, 1);
  });

  it('clamps to [30, 110]', () => {
    expect(gradientCycleSeconds(210)).toBeCloseTo(30, 1); // would be ~27s uncapped
    expect(gradientCycleSeconds(50)).toBeCloseTo(110, 1); // would be ~115s uncapped
  });
});

describe('interpolateBpmLog', () => {
  it('returns the start value at t=0 and end value at t=1', () => {
    expect(interpolateBpmLog(100, 140, 0)).toBeCloseTo(100, 5);
    expect(interpolateBpmLog(100, 140, 1)).toBeCloseTo(140, 5);
  });

  it('is monotonic between the two endpoints', () => {
    const a = interpolateBpmLog(100, 140, 0.25);
    const b = interpolateBpmLog(100, 140, 0.5);
    const c = interpolateBpmLog(100, 140, 0.75);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('breathMultipliers', () => {
  it('oscillates within the documented amplitude', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const { speed, alpha } = breathMultipliers(p);
      expect(speed).toBeGreaterThanOrEqual(1 - 0.08 - 1e-9);
      expect(speed).toBeLessThanOrEqual(1 + 0.08 + 1e-9);
      expect(alpha).toBeGreaterThanOrEqual(1 - 0.05 - 1e-9);
      expect(alpha).toBeLessThanOrEqual(1 + 0.05 + 1e-9);
    }
  });

  it('is neutral (1x) at phase 0', () => {
    expect(breathMultipliers(0).speed).toBeCloseTo(1, 10);
    expect(breathMultipliers(0).alpha).toBeCloseTo(1, 10);
  });
});

describe('energyTrailFactor', () => {
  it('is neutral when energy is undefined', () => {
    expect(energyTrailFactor(undefined)).toBe(1);
  });

  it('is within ±20% and inverse to energy', () => {
    const low = energyTrailFactor(0);
    const high = energyTrailFactor(1);
    expect(low).toBeGreaterThan(1);
    expect(high).toBeLessThan(1);
    expect(Math.abs(low - 1)).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(Math.abs(high - 1)).toBeLessThanOrEqual(0.2 + 1e-9);
  });
});

describe('valenceLightnessShift', () => {
  it('is 0 when valence is undefined', () => {
    expect(valenceLightnessShift(undefined)).toBe(0);
  });

  it('is within ±4%', () => {
    expect(valenceLightnessShift(0)).toBeCloseTo(-0.04, 5);
    expect(valenceLightnessShift(1)).toBeCloseTo(0.04, 5);
  });
});
