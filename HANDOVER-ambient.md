# Handover, part 2: Ambient landing page + report on its own route

This extends the existing Taste Drift app (see `HANDOVER.md` / `CLAUDE.md`). Every constraint in section 2 of that document still applies: check the current Spotify docs before writing API code, never send Spotify data to an LLM or embedding API, and so on.

## 1. What changes

1. **Routing**
   - `/` becomes a full-screen **ambient canvas**. It polls the currently-playing track, takes the dominant colors from the cover art, and drives a generative background (flow field plus slow gradients). The cover art is shown unmodified in the centre, and the palette shifts each time the song changes.
   - `/report` holds the existing report (bump chart and sensory sections), unchanged apart from being moved.
   - `/callback` stays as it is.
2. **Navigation**: the landing page has a button to the report, and the report has a way back.

## 2. Routing and page structure

- Add `react-router-dom`, and move the current page content into `src/pages/ReportPage.tsx` without changing its behaviour.
- **Lazy-load `ReportPage`** with `React.lazy`, so the landing page never downloads the report code or `norms.json`.
- **Return path after login**: before redirecting to Spotify, store the current route in `sessionStorage`. After `/callback`, send the user back to that route, so logging in from `/report` returns to `/report`.
- **Landing controls**: a fixed top-right button, "Taste report →". Keyboard shortcuts: `R` opens the report, `F` toggles fullscreen, `Esc` exits fullscreen.
- **Ambient mode**: all landing UI (buttons, track text) fades out after 3 s without mouse or keyboard activity and fades back in on activity. Hide the cursor while the UI is hidden.
- **Report page**: add a "← Now playing" link at the top.

## 3. Auth changes

- Add the scope `user-read-currently-playing`. (`user-read-playback-state` is needed only if you use `/me/player`; prefer the currently-playing endpoint.)
- **Existing tokens don't carry the new scope.** Read the `scope` string from the token response and store it. If a required scope is missing, clear the tokens and show "Reconnect Spotify" instead of failing with a 403.
- Keep one login flow that requests all scopes both pages need.

## 4. Currently-playing data

**Verify first.** Check the current reference for `GET /me/player/currently-playing` against the Feb, Mar, May, and Jul 2026 changelogs before implementing.

Expected behaviour (confirm each point):
- **Request**: call with `additional_types=track,episode` so podcast episodes return an item.
- **204 or empty body**: nothing is playing.
- **`item: null`** can happen during ads, in a private session, or for local files. Check `currently_playing_type` (`track`, `episode`, `ad`, `unknown`).
- **Artwork location**: tracks have it in `item.album.images`, episodes in `item.images`. Both are sorted largest-first (verify).

Normalize the response to:

```ts
type NowPlaying =
  | { state: 'idle' }                                   // 204 / nothing
  | { state: 'unavailable'; reason: 'ad' | 'private' | 'unknown' }
  | { state: 'playing' | 'paused'; id: string; kind: 'track' | 'episode';
      title: string; subtitle: string;                  // artists or show name
      artUrlLarge?: string; artUrlSmall?: string;       // largest / smallest image
      spotifyUrl: string; progressMs: number; durationMs: number; fetchedAt: number };
```

### 4.1 Polling (`src/nowplaying/poller.ts`)

Quota is shared across the whole developer account, so polling must be deliberate.

- **Timing**: while playing, schedule the next poll at `min(8 s, remaining + 1.5 s)`, where `remaining = durationMs - progressMs - (now - fetchedAt)`. This catches song changes quickly and still catches skips within 8 s.
- **Paused, idle, or unavailable**: poll every 20 s.
- **Hidden tab** (`document.hidden`): stop polling, and poll immediately on `visibilitychange` back to visible.
- **Rate limits (429)**: respect `Retry-After`. If the body reason is `QUOTA_EXCEEDED`, stop polling, show a small, non-blocking note ("Spotify quota reached — paused"), and retry in 15 min.
- **Network or 5xx errors**: exponential backoff (2 s, 4 s … capped at 60 s), keeping the last known state on screen.
- **Tunables**: put every interval in one exported config object.
- **Debug overlay**: toggled with `D`, it shows requests this session, requests in the last hour, the last status, and the next poll time.
- **Change detection**: emit a change event only when `id` changes, or when state moves between idle, unavailable, and playing/paused. Progress updates must not trigger palette work.
- **Structure**: write the scheduler as a pure function `nextDelay(state, now)` and unit-test it with fake timers.

## 5. Palette extraction (`src/palette/`)

Pure TypeScript with no DOM dependency except the image-loading helper.

- **Loading**: load the smallest artwork image with `img.crossOrigin = 'anonymous'`, draw it to an offscreen 64×64 canvas, and call `getImageData`.
  - **Verify** that Spotify's image CDN sends CORS headers that allow this. If the canvas comes out tainted, catch the `SecurityError` and fall back to the neutral palette. Never proxy images through a third-party service.
- **Algorithm**:
  1. Convert pixels to **OKLab**. Implement the conversion yourself; it's a few lines, and round-trip tests are required.
  2. Run k-means with k = 6, seeded deterministically from the album or episode id (k-means++ with a seeded RNG), for at most 10 iterations.
  3. Score each cluster by `population × (0.3 + chroma)`.
- **Output**:
  ```ts
  type Palette = {
    colors: string[];      // 3–5 accents, sorted by score, as CSS oklch() or hex
    background: string;    // darkest meaningful cluster, pushed to L≈0.12–0.18
    isMonochrome: boolean; // max chroma below threshold
    seed: number;          // hash of id, reused by the canvas
  };
  ```
- **Monochrome covers**: if the cover is essentially black and white, keep the palette monochrome with at most a faint tint. Do not invent saturated colors.
- **Merging**: merge clusters closer than ΔE_ok 0.04 so near-duplicates don't take up slots.
- **Caching**: store palettes by id in memory and in `localStorage` (LRU, 200 entries).
- **Neutral palette** (idle, unavailable, or errors): deep slate background with a desaturated blue-grey accent.
- **Tests**: use synthetic `ImageData` for a two-color image, a grayscale image, a single flat color, and a noisy image. The same input and seed must always give the same output.

## 6. Generative canvas (`src/canvas/`)

Full-viewport `<canvas>` behind everything.

### 6.1 Layers
1. **Gradient field**: 3–4 large radial gradients in palette colors that drift slowly (full cycle about 60–90 s) over the background color.
2. **Flow field**: particles move along angles taken from 3D simplex noise `(x, y, t)`. Use the small `simplex-noise` package, seeded from `palette.seed`, so each song gets its own recognizable field shape.
   - **Particle drawing**: short line segments at low alpha. Leave trails by painting a translucent background-colored rectangle each frame instead of clearing the canvas.
   - **Colors**: each particle is assigned a palette slot by weighted random choice using the cluster scores.

### 6.2 Song-change transition
- Interpolate the old palette to the new one over **4 s** in **OKLab** (never in RGB), with ease-in-out.
- Crossfade the noise seed over the same period by blending the angles from the two noise fields. Don't respawn particles; they should migrate into the new field.
- Handle rapid skips: if another change arrives mid-transition, start the new transition from the current interpolated state.

### 6.3 Playback state
- **Playing**: normal speed.
- **Paused**: ease the speed down to about 15% and dim the particles over 2 s.
- **Idle or unavailable**: neutral palette with slow motion.
- **No beat sync.** Audio analysis isn't available, so don't fake rhythm from progress or duration.

### 6.4 Performance and accessibility
- Cap `devicePixelRatio` at 2.
- **Particle count** ≈ `viewportArea / 1800`, capped at 4000. If the average frame time over 60 frames exceeds 20 ms, cut the count by 25%, down to a floor of 500.
- Pause the animation loop while the tab is hidden, and handle resize by debouncing, then rebuilding the buffers.
- **`prefers-reduced-motion`**: no particles; show only the gradient layer, nearly static, with palette crossfades.
- Keep all per-frame work allocation-free (preallocated typed arrays for particle state).

## 7. Centre artwork and track info

- **Artwork**: the large image, shown centred and square at `min(42vmin, 440px)`, with rounded corners of about 12px and a soft shadow tinted with the palette background colour.
  - **Crossfade** to the new image over 600 ms, only after it has loaded, so the old art never flashes to empty.
  - **Idle state**: fade the art to 20% opacity with "Nothing playing" underneath. If there's no art at all, show a neutral placeholder tile.
- **Track info**: title and subtitle below the art in small text, which fades with the ambient-mode UI. The title links to `spotifyUrl` ("Open in Spotify").
- **Attribution**: check Spotify's current Design & Branding Guidelines (developer.spotify.com, under Design) before finishing this section, and follow what they require. Expect at least:
  - Artwork displayed without cropping, distortion, overlays, or filters. Blur and recolour only the generated background, never the artwork itself.
  - Spotify attribution and a link back to the content.

  Add a small Spotify attribution mark in a corner if the guidelines require it.

## 8. Landing page states

| State | Canvas | Centre | Controls |
|---|---|---|---|
| Logged out | neutral, slow | "Connect Spotify" button | report button (report prompts login too) |
| Missing scope | neutral | "Reconnect Spotify" | report button |
| Idle | neutral | faded last art or placeholder, "Nothing playing" | report button |
| Unavailable (ad/private) | keep previous palette, slowed | keep previous art dimmed, small label | report button |
| Playing | song palette | art + info | auto-hiding UI |
| Paused | song palette, slowed and dimmed | art + "Paused" | auto-hiding UI |
| Quota/rate-limited | keep last state | small note | report button |

## 9. File layout additions

```
src/pages/LandingPage.tsx
src/pages/ReportPage.tsx          # moved existing content
src/nowplaying/api.ts             # fetch + normalize to NowPlaying
src/nowplaying/poller.ts          # scheduler, visibility, backoff
src/nowplaying/useNowPlaying.ts   # React hook
src/palette/oklab.ts
src/palette/kmeans.ts
src/palette/extract.ts
src/palette/cache.ts
src/canvas/AmbientCanvas.tsx
src/canvas/flowField.ts           # particles, noise, blending
src/canvas/gradients.ts
src/canvas/transition.ts          # palette + seed interpolation
src/components/NowPlayingCard.tsx
src/components/AmbientChrome.tsx  # auto-hiding buttons, shortcuts, fullscreen
src/components/DebugOverlay.tsx
tests/oklab.test.ts
tests/kmeans.test.ts
tests/extract.test.ts
tests/poller.test.ts
tests/transition.test.ts
```

## 10. Phases and acceptance criteria

Stop after each phase and summarize.

1. **Routing split**
   - The existing report works unchanged at `/report` and is lazy-loaded; confirm in the network tab that `norms.json` doesn't load on `/`.
   - Login from either page returns to that page.
   - The scope check prompts a reconnect when needed.
2. **Now-playing data**
   - `useNowPlaying` returns correct states for playing, paused, idle, and podcast; test by using Spotify on another device.
   - The debug overlay shows the request count. Polling stops while the tab is hidden, and the scheduler tests pass.
3. **Palette**
   - Extraction and caching work, and the tests pass.
   - A temporary swatch strip under the art shows the palette so the owner can judge it by eye across 10+ songs, including a black-and-white cover.
4. **Canvas**
   - The gradient and flow field render with the palette and switch smoothly on skip, including rapid skips.
   - Reduced-motion mode and the paused slowdown work.
   - The page holds ~60 fps on a laptop, and the adaptive particle count kicks in when throttled (check with CPU throttling in DevTools).
5. **Polish**
   - Auto-hiding UI, fullscreen, keyboard shortcuts, and all states from section 8.
   - Attribution checked against the Spotify guidelines.
   - Remove the temporary swatch strip, or move it into the debug overlay.

## 11. Non-goals

- Audio-reactive or beat-synced visuals (no audio data is available).
- Playback controls (these would need extra scopes; ask first).
- Showing anyone else's playback.
- Any external image proxy, LLM, or ML service.
