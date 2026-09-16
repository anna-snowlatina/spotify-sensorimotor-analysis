import { SpotifyQuotaError, SpotifyRateLimitError } from '../api/spotify';
import type { NowPlaying } from './api';

export const POLLER_CONFIG = {
  /** Cap on the delay while a track is playing. */
  playingMaxDelayMs: 8_000,
  /** Extra buffer added past the estimated remaining time, so we don't poll a hair too early. */
  playingBufferMs: 1_500,
  /** Poll interval while paused, idle, or unavailable. */
  idleDelayMs: 20_000,
  /** Exponential backoff starting point for network/5xx errors. */
  backoffBaseMs: 2_000,
  backoffCapMs: 60_000,
  /** How long to pause polling after a QUOTA_EXCEEDED 429. */
  quotaRetryMs: 15 * 60 * 1000,
};

/**
 * Pure scheduling function: given the last known state and the current time, how long until
 * the next poll? While playing, catches song changes quickly (bounded by playingMaxDelayMs)
 * and tries to land just after the track should end. Otherwise polls at a fixed, slow interval.
 */
export function nextDelay(state: NowPlaying, now: number): number {
  if (state.state !== 'playing') {
    return POLLER_CONFIG.idleDelayMs;
  }
  const elapsedSinceFetch = now - state.fetchedAt;
  const remaining = state.durationMs - state.progressMs - elapsedSinceFetch;
  const delay = remaining + POLLER_CONFIG.playingBufferMs;
  return Math.max(0, Math.min(POLLER_CONFIG.playingMaxDelayMs, delay));
}

function category(state: NowPlaying): 'idle' | 'unavailable' | 'active' {
  if (state.state === 'idle') return 'idle';
  if (state.state === 'unavailable') return 'unavailable';
  return 'active';
}

/** True when this is a meaningful change: a different item, or crossing between idle/unavailable/active. */
export function hasChanged(prev: NowPlaying | null, next: NowPlaying): boolean {
  if (!prev) return true;
  if (category(prev) !== category(next)) return true;
  const prevId = 'id' in prev ? prev.id : null;
  const nextId = 'id' in next ? next.id : null;
  return prevId !== nextId;
}

export type RequestLogEntry = { timestamp: number; status: 'ok' | 'error' };

export type PollerCallbacks = {
  /** Called on every successful poll, including progress-only updates. */
  onUpdate: (state: NowPlaying) => void;
  /** Called only when hasChanged() is true — the signal palette/canvas work should key off. */
  onChange?: (state: NowPlaying) => void;
  onQuotaExceeded?: () => void;
  onRequestLogged?: (entry: RequestLogEntry) => void;
  onScheduled?: (nextPollAt: number) => void;
};

/**
 * Drives polling of fetchNowPlaying: adaptive timing while playing, slow polling otherwise,
 * pauses entirely while the tab is hidden, and backs off on errors (respecting Retry-After and
 * the special QUOTA_EXCEEDED case).
 */
export class NowPlayingPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private backoffMs = POLLER_CONFIG.backoffBaseMs;
  private lastState: NowPlaying | null = null;
  private fetchFn: () => Promise<NowPlaying>;
  private callbacks: PollerCallbacks;

  constructor(fetchFn: () => Promise<NowPlaying>, callbacks: PollerCallbacks) {
    this.fetchFn = fetchFn;
    this.callbacks = callbacks;
  }

  start(): void {
    this.stopped = false;
    document.addEventListener('visibilitychange', this.handleVisibility);
    if (!document.hidden) void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private handleVisibility = (): void => {
    if (this.stopped) return;
    if (document.hidden) {
      if (this.timer) clearTimeout(this.timer);
    } else {
      void this.poll();
    }
  };

  private schedule(delayMs: number): void {
    if (this.stopped || document.hidden) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), delayMs);
    this.callbacks.onScheduled?.(Date.now() + delayMs);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    try {
      const state = await this.fetchFn();
      this.callbacks.onRequestLogged?.({ timestamp: Date.now(), status: 'ok' });
      this.backoffMs = POLLER_CONFIG.backoffBaseMs;

      const changed = hasChanged(this.lastState, state);
      this.lastState = state;
      this.callbacks.onUpdate(state);
      if (changed) this.callbacks.onChange?.(state);

      this.schedule(nextDelay(state, Date.now()));
    } catch (err) {
      this.callbacks.onRequestLogged?.({ timestamp: Date.now(), status: 'error' });

      if (err instanceof SpotifyQuotaError) {
        this.callbacks.onQuotaExceeded?.();
        this.schedule(POLLER_CONFIG.quotaRetryMs);
        return;
      }
      if (err instanceof SpotifyRateLimitError) {
        this.schedule(err.retryAfterSeconds * 1000);
        return;
      }
      // Network or 5xx: exponential backoff, keeping the last known state on screen.
      this.schedule(this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, POLLER_CONFIG.backoffCapMs);
    }
  }
}
