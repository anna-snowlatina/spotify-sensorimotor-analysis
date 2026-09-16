import { describe, it, expect } from 'vitest';
import { nextDelay, hasChanged, POLLER_CONFIG } from '../src/nowplaying/poller';
import type { NowPlaying } from '../src/nowplaying/api';

const playingBase: NowPlaying = {
  state: 'playing',
  id: 't1',
  kind: 'track',
  title: 'Song',
  subtitle: 'Artist',
  spotifyUrl: 'https://open.spotify.com/track/t1',
  progressMs: 0,
  durationMs: 200_000,
  fetchedAt: 0,
};

describe('nextDelay', () => {
  it('polls at the fixed idle interval when paused', () => {
    expect(nextDelay({ ...playingBase, state: 'paused' }, 0)).toBe(POLLER_CONFIG.idleDelayMs);
  });

  it('polls at the fixed idle interval when idle', () => {
    expect(nextDelay({ state: 'idle' }, 0)).toBe(POLLER_CONFIG.idleDelayMs);
  });

  it('polls at the fixed idle interval when unavailable', () => {
    expect(nextDelay({ state: 'unavailable', reason: 'ad' }, 0)).toBe(POLLER_CONFIG.idleDelayMs);
  });

  it('caps the delay at playingMaxDelayMs when a lot of time remains', () => {
    const state: NowPlaying = { ...playingBase, progressMs: 0, durationMs: 300_000, fetchedAt: 0 };
    expect(nextDelay(state, 0)).toBe(POLLER_CONFIG.playingMaxDelayMs);
  });

  it('targets just past the remaining time when the track is close to ending', () => {
    // 200s duration, 195s already played, no time elapsed since fetch -> 5s remaining + 1.5s buffer = 6.5s
    const state: NowPlaying = { ...playingBase, progressMs: 195_000, durationMs: 200_000, fetchedAt: 0 };
    expect(nextDelay(state, 0)).toBe(6_500);
  });

  it('accounts for time already elapsed since the fetch', () => {
    // 5s remaining at fetch time, but 2s have already passed -> 3s + 1.5s buffer = 4.5s
    const state: NowPlaying = { ...playingBase, progressMs: 195_000, durationMs: 200_000, fetchedAt: 0 };
    expect(nextDelay(state, 2_000)).toBe(4_500);
  });

  it('never returns a negative delay for a track that should have already ended', () => {
    const state: NowPlaying = { ...playingBase, progressMs: 199_000, durationMs: 200_000, fetchedAt: 0 };
    expect(nextDelay(state, 60_000)).toBe(0);
  });
});

describe('hasChanged', () => {
  it('is true on the first observation', () => {
    expect(hasChanged(null, { state: 'idle' })).toBe(true);
  });

  it('is false when the same track keeps progressing', () => {
    const a = { ...playingBase, progressMs: 10_000 };
    const b = { ...playingBase, progressMs: 15_000 };
    expect(hasChanged(a, b)).toBe(false);
  });

  it('is true when the track id changes', () => {
    const a = playingBase;
    const b = { ...playingBase, id: 't2' };
    expect(hasChanged(a, b)).toBe(true);
  });

  it('is true when crossing from playing to idle', () => {
    expect(hasChanged(playingBase, { state: 'idle' })).toBe(true);
  });

  it('is false between playing and paused for the same track (still "active")', () => {
    const paused: NowPlaying = { ...playingBase, state: 'paused' };
    expect(hasChanged(playingBase, paused)).toBe(false);
  });

  it('is true when moving between two different unavailable reasons is not required, but idle<->unavailable is', () => {
    expect(hasChanged({ state: 'idle' }, { state: 'unavailable', reason: 'ad' })).toBe(true);
  });
});
