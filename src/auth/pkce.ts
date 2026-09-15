// Authorization Code with PKCE, fully client-side (Implicit Grant is deprecated).
// The PKCE verifier lives in sessionStorage (only needed across the redirect round trip).
// Tokens live in localStorage (acceptable for this single-user local app).

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI = 'http://127.0.0.1:5173/callback';
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SCOPE = 'user-top-read';

const VERIFIER_KEY = 'taste-drift:pkce_verifier';
const TOKENS_KEY = 'taste-drift:tokens';

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
};

function assertClientId(): string {
  if (!CLIENT_ID) {
    throw new Error(
      'VITE_SPOTIFY_CLIENT_ID is not set. Add it to .env.local (see HANDOVER.md section 4).',
    );
  }
  return CLIENT_ID;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export function getStoredTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

function storeTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export async function login(): Promise<void> {
  const clientId = assertClientId();
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFromVerifier(verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.assign(`${AUTH_ENDPOINT}?${params.toString()}`);
}

/**
 * Call from the /callback route. Exchanges the ?code= for tokens.
 * Throws if the verifier is missing (e.g. login started on localhost, callback landed on 127.0.0.1).
 */
export async function handleCallback(searchParams: URLSearchParams): Promise<Tokens> {
  const clientId = assertClientId();
  const error = searchParams.get('error');
  if (error) {
    throw new Error(`Spotify login failed: ${error}`);
  }

  const code = searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code in callback URL.');
  }

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    throw new Error(
      'Missing PKCE verifier. Did you open the app at http://127.0.0.1:5173 (not localhost)?',
    );
  }
  sessionStorage.removeItem(VERIFIER_KEY);

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens: Tokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  storeTokens(tokens);
  return tokens;
}

/**
 * Refreshes the access token. On failure (e.g. the ~6-month-old refresh token expired),
 * clears stored tokens so the caller can fall back to the login screen.
 */
export async function refreshAccessToken(): Promise<Tokens> {
  const clientId = assertClientId();
  const current = getStoredTokens();
  if (!current) {
    throw new Error('No tokens to refresh.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    clearTokens();
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const tokens: Tokens = {
    accessToken: json.access_token,
    // Spotify may or may not rotate the refresh token; keep the old one if absent.
    refreshToken: json.refresh_token ?? current.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  storeTokens(tokens);
  return tokens;
}

/**
 * Returns a valid access token, refreshing proactively if it expires within 60s.
 * Returns null if there are no tokens or refresh fails (caller should show the login button).
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  const expiresSoon = Date.now() > tokens.expiresAt - 60_000;
  if (!expiresSoon) return tokens.accessToken;

  try {
    const refreshed = await refreshAccessToken();
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getStoredTokens() !== null;
}

export function logout(): void {
  clearTokens();
}
