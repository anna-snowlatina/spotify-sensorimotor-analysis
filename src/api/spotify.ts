import { getValidAccessToken, refreshAccessToken, clearTokens } from '../auth/pkce';

const API_BASE = 'https://api.spotify.com/v1';

export class SpotifyQuotaError extends Error {
  constructor(message = 'Spotify developer quota exceeded for this app.') {
    super(message);
    this.name = 'SpotifyQuotaError';
  }
}

export class SpotifyRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Rate limited by Spotify. Retry after ${retryAfterSeconds}s.`);
    this.name = 'SpotifyRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class SpotifyAuthError extends Error {
  constructor(message = 'Not authenticated with Spotify.') {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

/**
 * Fetches a Spotify Web API path (e.g. "/me/top/artists?...").
 * Handles:
 * - 401: attempts one token refresh + retry, then surfaces SpotifyAuthError.
 * - 429 with reason QUOTA_EXCEEDED: throws SpotifyQuotaError (not a normal rate limit -
 *   the app's shared developer quota is exhausted, retrying won't help soon).
 * - 429 otherwise: throws SpotifyRateLimitError with the Retry-After header.
 */
export async function spotifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let token = await getValidAccessToken();
  if (!token) {
    throw new SpotifyAuthError();
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    try {
      const refreshed = await refreshAccessToken();
      token = refreshed.accessToken;
    } catch {
      clearTokens();
      throw new SpotifyAuthError('Session expired. Please log in again.');
    }
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
    let reason: string | undefined;
    try {
      const body = (await res.clone().json()) as { error?: { reason?: string } };
      reason = body.error?.reason;
    } catch {
      // body may not be JSON; ignore
    }
    if (reason === 'QUOTA_EXCEEDED') {
      throw new SpotifyQuotaError();
    }
    throw new SpotifyRateLimitError(retryAfter);
  }

  if (res.status === 401) {
    throw new SpotifyAuthError('Session expired. Please log in again.');
  }

  if (!res.ok) {
    throw new Error(`Spotify API error ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as T;
}
