# Handover, part 3: Tempo-paced ambient canvas

This extends `HANDOVER-ambient.md`. **Build it after the ambient canvas works** (phase 4 or later of that document). All earlier constraints still apply.

## 1. Goal

The canvas moves at the pace of the currently playing song's BPM: slow songs drift, fast songs stream.

**Pacing, not beat sync.** We get a tempo number but no beat timing, and Spotify's `progress_ms` is too coarse to line motion up with actual beats. So:
- **Allowed:** overall speed, turbulence, and a *soft* periodic "breath" at a multiple of the beat period.
- **Not allowed:** sharp flashes or jumps meant to hit individual beats. They would visibly drift off the music within seconds.

## 2. Tempo sources (`src/tempo/`)

Spotify no longer provides tempo, so we use third-party lookups. **Before implementing, read each provider's current docs and terms: endpoint shape, rate limits, attribution requirements, and CORS behaviour.**

Lookup order, with the first valid result winning:

1. **ReccoBeats**, looked up by Spotify track ID. It returns tempo and other audio features (energy, valence, …). A missing track returns 404. It's free but rate-limited, and it's a small third party, so treat it as optional.
2. **Deezer**, looked up by ISRC via `GET https://api.deezer.com/track/isrc:{ISRC}`, reading the `bpm` field. Treat `bpm: 0` as unknown. The ISRC comes from `item.external_ids.isrc` on the currently-playing response. Verify the field is present; the March 2026 changelog says it was kept.
3. **Unknown**: fall back to the defaults in section 4.

Normalize both providers to:
```ts
type TempoInfo = {
  bpm: number | null;          // null = unknown
  energy?: number;             // 0–1, ReccoBeats only
  valence?: number;            // 0–1, ReccoBeats only
  source: 'reccobeats' | 'deezer' | 'override' | 'none';
};
```

### Rules
- **One lookup per song change**, never per poll. Time out each provider after 3 s. Tempo lookup must never delay the artwork or palette; the canvas starts at default pace and eases to the real tempo when it arrives.
- **Cache** results by Spotify track ID in `localStorage` (LRU, 500 entries). Cache misses too, with a 7-day TTL, so unknown tracks aren't re-queried every play.
- **Podcast episodes, ads, and unknown items**: skip the lookup and use `source: 'none'`.
- **CORS**: test both providers from the browser. If either is blocked, add a **Vite dev-server proxy** (`server.proxy`) for it. Do not use any public or third-party CORS proxy. For Deezer, JSONP is an acceptable alternative if the docs still support it.
- **Data sent**: only the Spotify track ID or ISRC goes to these services. Nothing else, and no user data.
- **Attribution**: if either provider's terms require it, show it in the debug overlay and in the small tempo label (section 5).

### Validation and octave errors
Tempo detectors often report half or double the true tempo.
- Accept any BPM from 50 to 210. Treat values outside that range as unknown.
- If both providers return values with a ratio of about 2 (within 3%), prefer ReccoBeats. Don't try to guess automatically beyond that.
- **Manual override:** the `[` key halves and the `]` key doubles the current track's BPM. Store this in the cache as `source: 'override'`; it takes priority on later plays. `\` clears the override.

## 3. Motion model (`src/tempo/pace.ts`, pure functions)

```ts
const REF_BPM = 120;
const DEFAULT_BPM = 100;

// Perceptual compression so 60 vs 180 BPM differ clearly but not absurdly.
export function paceFactor(bpm: number): number {
  return clamp(Math.pow(bpm / REF_BPM, 0.8), 0.5, 1.8);
}
export const beatPeriodSec = (bpm: number) => 60 / bpm;
```

How tempo drives the canvas:

| Parameter | Mapping |
|---|---|
| Particle speed | `baseSpeed × paceFactor(bpm)` |
| Noise time evolution (turbulence) | `baseNoiseRate × paceFactor(bpm)` |
| Gradient drift cycle | 96 beats (48 s at 120 BPM, 72 s at 80 BPM), clamped to 30–110 s |
| Breath (optional, on by default) | sinusoid with period **4 beats**: speed ×(1 ± 0.08), particle alpha ×(1 ± 0.05) |
| Energy (if available) | trail length and density: `energy` 0 → longer, sparser trails; 1 → shorter, denser. Keep the effect subtle (±20%) |
| Valence (if available) | optional ±4% lightness shift of the gradient layer only. Off by default |

The breath assumes 4/4 time. Its phase starts at the song change and is **not** aligned to the music. Keep its amplitude small enough that the misalignment isn't noticeable.

**Combining with playback state**: multiply the tempo pace by the paused or idle slowdown from `HANDOVER-ambient.md` (the paused state still eases to about 15%, and the breath is disabled while paused).

**Unknown tempo**: use `DEFAULT_BPM`, disable the breath, and don't use energy or valence.

**Reduced motion**: ignore tempo except for the gradient cycle length.

## 4. Continuity (critical)

Changing a rate must never cause a jump in position or phase.

- **Integrate time; never compute from elapsed time.** Keep accumulators and advance them each frame:
  ```ts
  noiseT     += dt * noiseRate(currentPace);
  gradientT  += dt / gradientCycle(currentBpm);
  breathPhase += dt / (4 * beatPeriodSec(currentBpm));
  ```
  **Never** write `noiseT = elapsed * rate`. When the rate changes, the whole field would teleport.
- **Tempo transitions**: on song change, or when a lookup resolves, interpolate BPM over **4 s** in **log space** (`exp(lerp(log a, log b, t))`) with ease-in-out. Run this alongside the palette transition, and restart it from the current value if another change arrives mid-transition.
- **Late lookups**: if the result arrives more than 4 s after the song change, ease from the default to the real tempo over 4 s.

## 5. UI

- **Tempo label**: under the track info, a small "♩ 124 BPM", fading with the ambient UI. Show "♩ —" when unknown. Mark overridden values subtly, e.g. "♩ 62 BPM (½)".
- **Debug overlay** (`D`): show the BPM, source, raw value from each provider, cache hit or miss, override state, current pace factor, and breath on or off.
- **Shortcuts**: `B` toggles the breath; `[`, `]`, and `\` apply or clear the octave override (section 2). Add these to any shortcut help.

## 6. Files

```
src/tempo/providers/reccobeats.ts
src/tempo/providers/deezer.ts
src/tempo/lookup.ts        # order, timeouts, validation, cache, overrides
src/tempo/cache.ts
src/tempo/pace.ts          # paceFactor, mappings, log-space interpolation
src/tempo/useTempo.ts      # React hook keyed on current track id
tests/pace.test.ts
tests/tempoLookup.test.ts  # mocked providers: hit, 404, bpm 0, timeout, octave pair, override precedence, episode skip
tests/continuity.test.ts   # accumulators: no discontinuity when rate changes mid-run
```

## 7. Phases and acceptance criteria

1. **Lookup**
   - Providers, fallback, cache, and validation work, and the tests pass.
   - The debug overlay shows the BPM and source for the current song.
   - CORS is resolved (proxy only if needed).
2. **Pacing**
   - Canvas speed, turbulence, and gradient cycle follow the BPM, with smooth 4 s transitions and no visible jump on skip, including rapid skips.
   - Owner check: play a slow song (below 80 BPM), a mid-tempo one (around 120), and a fast one (above 160), and confirm the three are clearly different.
3. **Breath and energy**
   - The breath is subtle and toggleable.
   - Energy (if available) adjusts trails.
   - Octave override keys work and persist.
4. **Polish**
   - Tempo label and attribution per provider terms.
   - Reduced-motion behaviour confirmed.
   - Frame time unaffected: all tempo work happens outside the per-particle loop.

## 8. Non-goals

- Beat-accurate sync or flashes on beats.
- Microphone-based beat detection (possible later as an opt-in mode; ask first).
- Any scraper that claims to return Spotify's own audio features.
- Sending anything beyond track IDs or ISRCs to third parties.
