// Saves the current short_term top-50 (artists + tracks) to data/snapshots/YYYY-MM-DD.json
// using a stored refresh token, so the bump chart can show historical columns over time.
//
// One-time setup:
//   1. Log into the app in the browser as usual.
//   2. Open the "Debug: reveal refresh token" control on the page and copy the value.
//   3. Add it to .env.local as SPOTIFY_REFRESH_TOKEN=... (already gitignored).
//
// Usage: node scripts/snapshot.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL_PATH = path.join(__dirname, '..', '.env.local');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function refreshAccessToken(clientId, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchTopItems(accessToken, type) {
  const res = await fetch(`${API_BASE}/me/top/${type}?time_range=short_term&limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch top ${type}: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.items;
}

function normalizeArtists(items) {
  return items.map((artist, index) => ({
    id: artist.id,
    name: artist.name,
    rank: index + 1,
    imageUrl: artist.images?.[0]?.url,
  }));
}

function normalizeTracks(items) {
  return items.map((track, index) => ({
    id: track.id,
    name: track.name,
    rank: index + 1,
    imageUrl: track.album?.images?.[0]?.url,
    artistNames: track.artists.map((a) => a.name),
  }));
}

function backfillArtistImages(artists, tracks) {
  return artists.map((artist) => {
    if (artist.imageUrl) return artist;
    const bestTrack = tracks
      .filter((t) => t.artistNames?.includes(artist.name))
      .sort((a, b) => a.rank - b.rank)[0];
    return bestTrack?.imageUrl ? { ...artist, imageUrl: bestTrack.imageUrl } : artist;
  });
}

async function main() {
  const env = { ...parseEnvFile(ENV_LOCAL_PATH), ...process.env };
  const clientId = env.VITE_SPOTIFY_CLIENT_ID;
  const refreshToken = env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !refreshToken) {
    console.error('Missing VITE_SPOTIFY_CLIENT_ID or SPOTIFY_REFRESH_TOKEN in .env.local.');
    console.error('See the comment at the top of this script for how to obtain the refresh token.');
    process.exit(1);
  }

  console.log('Refreshing access token…');
  let tokens;
  try {
    tokens = await refreshAccessToken(clientId, refreshToken);
  } catch (err) {
    console.error(err.message);
    console.error('Your stored refresh token may have expired (~6 months). Log in again in the');
    console.error('browser, grab a fresh refresh token, and update .env.local.');
    process.exit(1);
  }

  console.log('Fetching short_term top 50 artists and tracks…');
  const [rawArtists, rawTracks] = await Promise.all([
    fetchTopItems(tokens.access_token, 'artists'),
    fetchTopItems(tokens.access_token, 'tracks'),
  ]);

  const tracks = normalizeTracks(rawTracks);
  const artists = backfillArtistImages(normalizeArtists(rawArtists), tracks);

  const date = new Date().toISOString().slice(0, 10);
  const snapshot = { date, artists, tracks };

  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const outPath = path.join(SNAPSHOTS_DIR, `${date}.json`);
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${outPath} (${artists.length} artists, ${tracks.length} tracks).`);
}

main();
