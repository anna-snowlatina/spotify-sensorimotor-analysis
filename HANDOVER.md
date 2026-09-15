# Handover: Taste Drift (Spotify bump chart + sensorimotor title map)

Personal, single-user web app. Owner has Spotify Premium and is the only user. Notes written September 2026.

## 1. What we're building

One page, two sections, one shared dataset (the owner's top artists/tracks across Spotify's three time windows).

1. **Bump chart**: rank of top artists (toggle: tracks) across long_term → medium_term → short_term (oldest on the left). Shows who rose, fell, appeared, or disappeared.
2. **Sensory space**: track *titles* scored against the Lancaster Sensorimotor Norms (Lynott et al., 2020, 11 dimensions). Shows the sensory profile of each window, how it shifts, and which words drive it.

Story of the page: "how my taste is shifting", told by *who* (bump chart) and by *what the titles evoke* (sensory).

## 2. Hard constraints (read before writing code)

The Spotify Web API changed substantially in Nov 2024 and Feb 2026. **Most tutorials and much of your training data are out of date. Before implementing any Spotify call, fetch and check the current docs:**
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/documentation/web-api/references/changes/february-2026 (plus the March, May, and July 2026 changelog pages linked from it)

Known facts as of writing:
- **Removed endpoints**: Audio Features, Audio Analysis, Recommendations, and Related Artists (unavailable to new apps since Nov 2024). Artist top tracks, new releases, and bulk "get several" metadata calls were removed in Feb 2026. **Do not use any of these.**
- **Removed fields**: artist popularity and follower counts. Before relying on `genres`, `popularity`, or `images`, verify against the current object reference. Where a field is missing, degrade gracefully instead of crashing.
- **Development Mode rules**: the app owner must have Premium, each app is limited to 5 users, and quota is shared per developer account. A 429 response with reason `QUOTA_EXCEEDED` is a quota limit, not a normal rate limit, so handle the two differently.
- **Refresh tokens** now expire about six months after the original consent. When a refresh fails, send the user back through login cleanly.
- **Auth**: use Authorization Code with PKCE. Implicit grant is deprecated.
- **Redirect URI**: `localhost` is not accepted. Use `http://127.0.0.1:5173/callback`.
- **Spotify Developer Terms (v10)**: Spotify Content must not be used to train or be ingested into ML/AI models. **Never send track titles or any other Spotify data to an LLM or embedding API.** The sensory scoring is a plain lookup table plus arithmetic, and it must stay that way.

## 3. Stack

- Vite + React + TypeScript
- D3 for the charts (a light chart library for the radar is acceptable if it saves time)
- Vitest for unit tests
- No backend: PKCE runs fully in the browser, and the client ID is not a secret
- Node script for preprocessing the norms (`scripts/`)

## 4. Setup (manual steps for the owner, listed so you can prompt for them)

1. Create an app at developer.spotify.com/dashboard, select **Web API**, and add the redirect URI `http://127.0.0.1:5173/callback`. If calls return 403, add the owner's account under User Management.
2. Put the client ID in `.env.local` as `VITE_SPOTIFY_CLIENT_ID=...`. Add `.env.local` to `.gitignore`.
3. Download the Lancaster Sensorimotor Norms CSV from the OSF repository linked in Lynott et al. (2020), *Behavior Research Methods*. Save it to `data/raw/lancaster_norms.csv`, and gitignore `data/raw/`.

## 5. File layout

```
data/raw/lancaster_norms.csv        # manual download, gitignored
scripts/build-norms.mjs             # CSV -> public/norms.json
public/norms.json                   # generated
src/auth/pkce.ts                    # verifier/challenge, login, callback, refresh
src/api/spotify.ts                  # typed fetch wrapper, 401/429 handling
src/data/cache.ts                   # localStorage cache with TTL
src/data/topItems.ts                # the 6 requests, normalized
src/sensory/clean.ts                # title cleaning + tokenization
src/sensory/score.ts                # word lookup, track vectors, window profiles
src/sensory/stats.ts                # z-scores, Minkowski distance, PCA
src/components/BumpChart.tsx
src/components/SensoryRadar.tsx
src/components/SensoryScatter.tsx
src/components/DriftStat.tsx
src/components/CoverageNote.tsx
tests/clean.test.ts
tests/score.test.ts
tests/stats.test.ts
```

## 6. Auth details

- Scope: `user-top-read`. Add nothing else unless a feature needs it.
- Store the PKCE verifier in `sessionStorage`. Store tokens and expiry in `localStorage` (a local personal app, so this is acceptable).
- **Origin gotcha**: set `server.host: '127.0.0.1'` in `vite.config.ts`, and always open the app at `http://127.0.0.1:5173`, never `localhost`. Browser storage is per-origin, so a verifier saved on `localhost` will be missing when the callback lands on `127.0.0.1`, and auth will fail with a confusing error.
- Refresh the access token proactively about 60s before expiry. If the refresh fails, clear the tokens and show the login button.

## 7. Data

Six requests: `GET /me/top/{artists|tracks}?time_range={long_term|medium_term|short_term}&limit=50`.

- Confirm the current meaning of each `time_range` in the docs and use it in the UI labels (at time of writing: roughly 1 year, 6 months, and 4 weeks).
- **The windows overlap**: long_term includes recent listening. Say so in a one-line caption so nobody reads the three columns as independent periods.
- Normalize the responses to:

```ts
type Window = 'long_term' | 'medium_term' | 'short_term';
type RankedItem = { id: string; name: string; rank: number; imageUrl?: string; artistNames?: string[] };
type TopData = Record<Window, { artists: RankedItem[]; tracks: RankedItem[] }>;
```

- Cache the full `TopData` in localStorage with a 6-hour TTL, and add a "Refresh data" button that bypasses the cache.
- **Artist images**: if artist objects no longer include `images`, fall back to the album art of that artist's highest-ranked track in the dataset, then to a placeholder with initials.

## 8. Section 1: Bump chart

- **Layout**: three columns in the order long_term, medium_term, short_term. Y is rank 1–50, with rank 1 at the top.
- **Lines**: each item gets a line through the windows it appears in. Endpoints are small circular images.
- **Newcomers** (only in short_term) get an accent color and a short lead-in stub from the left.
- **Faded** entries (in long_term, not in short_term) get a line that fades out toward the right edge.
- **Stalwarts** (present in all three) are drawn emphasized. Everything else is muted.
- **Interaction**: hovering highlights one line and shows the name plus its ranks; a toggle switches between artists and tracks.
- **Readability**: 50 lines is a lot. Default to showing the top 20 of any window, with a "show all 50" switch.

## 9. Section 2: Sensory space

### 9.1 Norms preprocessing (`scripts/build-norms.mjs`)

- **Read the CSV and inspect the headers first.** The expected per-dimension mean columns are Auditory, Gustatory, Haptic, Interoceptive, Olfactory, Visual (perceptual) and Foot_leg, Hand_arm, Head, Mouth, Torso (action), each with a `.mean` suffix. **Verify the exact names against the file and fail loudly if any are missing.** Scale is 0–5.
- **Lowercase the words.** They may be uppercase in the source. Keep only entries matching `^[a-z]+$`.
- **Output** compact JSON:
  ```json
  { "dims": ["Auditory", ...11], "words": { "fire": [/*11 numbers, 2 dp*/] }, "mean": [..11], "sd": [..11] }
  ```
  `mean` and `sd` are the per-dimension statistics across all norm words, unweighted. They are the baseline for z-scores.
- **Log** the word count and output file size. If the file exceeds about 3 MB, switch to a words array plus a flat Float32 values array (base64).

### 9.2 Title cleaning (`src/sensory/clean.ts`)

Only track titles are scored. Artist names are proper nouns and are not scored.

1. **Normalize characters**: apply Unicode NFKC and turn curly apostrophes into straight ones.
2. **Strip version tags.** Remove bracketed or parenthesized segments containing any of: feat, ft., with, remaster, remastered, live, version, edit, mix, remix, mono, stereo, demo, acoustic, instrumental, bonus, deluxe, from, radio. Also remove ` - ...` suffixes containing the same keywords.
3. **Tokenize**: lowercase, then split on anything that isn't a letter or apostrophe.
4. **Handle apostrophes.** Strip a trailing `'s`, then drop any token that still contains an apostrophe.
5. **Drop stopwords.** Use a standard English stopword list, kept in the repo as a constant.
6. **Look up each token.** Try the exact form first. If that fails, try fallback forms in this order: strip `ing` (also try adding `e`), strip `ed` (also try adding `e`), strip `es`, strip `s`, strip `ly`. Take the first hit. Keep it rule-based, with no NLP dependency.
7. **Return** `{ tokens, matched: {token, lemma}[], unmatched: string[] }`.

Unit tests must cover invented examples such as:
- `"Burning Rooms (feat. Someone) - Remastered 2011"` → matched includes burn(ing), room(s)
- `"Something (Live at Somewhere)"` → the tag is removed
- A title in another language → zero matches, with no crash
- An empty result → the track is excluded from profiles but counted in the coverage figure

### 9.3 Scoring (`src/sensory/score.ts`)

- **Track vector**: the mean of the matched word vectors. Tracks with zero matches get `null`.
- **Window profile**: the mean of non-null track vectors. Implement an optional rank weighting `w = 1 / sqrt(rank)` behind a toggle, off by default.
- **Z-scoring**: convert every profile (and every track vector used in plots) with `z = (x - mean) / sd` using the norms baseline. **Charts show z-scores, not raw means.** Raw means are dominated by the visual dimension in any English text, which would make every profile look "visual."
- **Coverage**: report, per window, the number of tracks scored out of 50 and the share of tokens matched.

### 9.4 Visuals

- **SensoryRadar**: 11 axes, three overlaid shapes (one per window, same colors as the bump chart window headers if any). Order the axes as the six perceptual then the five action dimensions, with a subtle divider between the groups. Draw a zero ring labeled "average English word."
- **SensoryScatter**: run PCA to 2 components on the z-scored track vectors from all windows, with each point being one track colored by window. Implement PCA directly (covariance matrix plus power iteration, or a small well-known library). Label the axes with each component's top-loading dimensions, e.g. "PC1: Visual+, Auditory−". Clicking a point opens a panel showing the title, its matched words, and each word's biggest contributions.
- **DriftStat**: the Minkowski distance (p = 3) between the short_term and long_term z-scored profiles across all 11 dimensions. Show it as a single number, with a one-line explanation and the two dimensions that moved most.
- **CoverageNote**: a small, always-visible note, e.g. "34/50 titles scored this window."

## 10. Build phases and acceptance criteria

Work in this order. Stop at the end of each phase and summarize for the owner.

1. **Auth + data**: logging in works from `http://127.0.0.1:5173`, the six requests succeed, and the page shows the normalized `TopData` as collapsible JSON. The cache and refresh button both work, and a forced 401 triggers a token refresh.
2. **Bump chart**: renders both modes, the newcomer/faded/stalwart styling is visible, hover works, and the top-20 default applies.
3. **Norms + cleaner**: the script produces `norms.json`, and the unit tests pass. A debug view lists every title with its matched and unmatched tokens so the owner can check the matches by eye.
4. **Scoring + radar**: z-scored profiles render, and the coverage note is shown. `stats.test.ts` covers the z-score and Minkowski computations with hand-computed cases.
5. **Scatter + drift + polish**: the PCA scatter and click panel, the drift stat, responsive layout, and light/dark themes are done.
6. **Optional, only if asked**: `scripts/snapshot.mjs` saves the short_term top-50 to `data/snapshots/YYYY-MM-DD.json`, using a stored refresh token. The bump chart gains a mode that uses snapshots as additional columns.

## 11. Non-goals

- Anything based on audio features, tempo, energy, or recommendations. Those endpoints are gone.
- Lyrics.
- Multi-user support or public deployment with login.
- Any LLM or embedding call involving Spotify data.

## 12. Code style

- TypeScript strict mode. Pure functions in `src/sensory/` with no DOM or React dependencies, so they stay testable.
- Handle errors visibly in the UI. Never fail silently.
- Keep the dependency count low, and ask before adding anything heavy.
