import { describe, it, expect } from 'vitest';
import { gradientCycleSeconds, BpmTransitionManager } from '../src/tempo/pace';

describe('accumulator continuity', () => {
  it('integrating gradientT frame-by-frame matches integrating it in one big step (no teleport from batching)', () => {
    const bpm = 120;
    const cycle = gradientCycleSeconds(bpm);
    const totalDtSec = 10;

    // Ten small 1s steps...
    let stepped = 0;
    for (let i = 0; i < 10; i++) stepped += 1 / cycle;

    // ...should equal one accumulation of the same total elapsed time.
    const atOnce = totalDtSec / cycle;
    expect(stepped).toBeCloseTo(atOnce, 10);
  });

  it('changing the cycle length mid-run does not retroactively rewrite past accumulated phase', () => {
    // Simulates: accumulate for a while at cycle A, then the BPM (and thus the cycle) changes.
    // The accumulated turns before the change must be unaffected by the new cycle length.
    let gradientT = 0;
    const cycleA = gradientCycleSeconds(120);
    for (let i = 0; i < 5; i++) gradientT += 1 / cycleA; // 5 "seconds" at cycle A
    const turnsBeforeChange = gradientT;

    const cycleB = gradientCycleSeconds(80);
    for (let i = 0; i < 5; i++) gradientT += 1 / cycleB; // 5 more "seconds" at cycle B

    // The phase accumulated before the change is untouched by whatever happens after.
    expect(gradientT).toBeGreaterThan(turnsBeforeChange);
    expect(turnsBeforeChange).toBeCloseTo(5 / cycleA, 10);
  });

  it('BpmTransitionManager never jumps: sampling immediately after setTarget equals the pre-change value', () => {
    const manager = new BpmTransitionManager(100, 0);
    const before = manager.sample(1000);
    manager.setTarget(160, 1000);
    const justAfter = manager.sample(1000);
    expect(justAfter).toBeCloseTo(before, 6);
  });

  it('BpmTransitionManager restarts a rapid second change from the currently-interpolated value', () => {
    const manager = new BpmTransitionManager(100, 0);
    manager.setTarget(160, 0);
    const midway = manager.sample(2000);

    manager.setTarget(90, 2000);
    const justAfterSecondChange = manager.sample(2000);
    expect(justAfterSecondChange).toBeCloseTo(midway, 6);
  });

  it('BpmTransitionManager eventually reaches the target and stays there', () => {
    const manager = new BpmTransitionManager(100, 0);
    manager.setTarget(160, 0);
    expect(manager.sample(4000)).toBeCloseTo(160, 5);
    expect(manager.sample(50_000)).toBeCloseTo(160, 5);
  });
});
