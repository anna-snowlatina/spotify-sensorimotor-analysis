import { useEffect, useRef, useState } from 'react';
import { lookupTempo, applyOctaveOverride, clearOctaveOverride, type TempoInfo } from './lookup';
import { getCachedTempo } from './cache';

export type UseTempoResult = {
  tempo: TempoInfo;
  cacheHit: boolean;
  applyOverride: (direction: 'half' | 'double') => void;
  clearOverride: () => void;
};

/** Looks up tempo once per track id change (never per poll). Never blocks rendering. */
export function useTempo(
  trackId: string | null,
  isrc: string | undefined,
  itemType: 'track' | 'episode' | 'other',
): UseTempoResult {
  const [tempo, setTempo] = useState<TempoInfo>({ bpm: null, source: 'none' });
  const [cacheHit, setCacheHit] = useState(false);
  const trackIdRef = useRef(trackId);
  trackIdRef.current = trackId;

  useEffect(() => {
    if (!trackId) {
      setTempo({ bpm: null, source: 'none' });
      setCacheHit(false);
      return;
    }

    const existing = getCachedTempo(trackId);
    setCacheHit(existing !== null);
    if (existing) {
      setTempo(existing);
      return;
    }

    setTempo({ bpm: null, source: 'none' }); // unknown while loading; pacing uses DEFAULT_BPM meanwhile
    let cancelled = false;
    void lookupTempo({ trackId, isrc, itemType }).then((result) => {
      if (cancelled || trackIdRef.current !== trackId) return;
      setTempo(result);
    });
    return () => {
      cancelled = true;
    };
  }, [trackId, isrc, itemType]);

  function applyOverride(direction: 'half' | 'double') {
    if (!trackId || tempo.bpm === null) return;
    setTempo(applyOctaveOverride(trackId, tempo.bpm, direction));
  }

  function clearOverride() {
    if (!trackId) return;
    clearOctaveOverride(trackId);
    void lookupTempo({ trackId, isrc, itemType }).then((result) => {
      if (trackIdRef.current !== trackId) return;
      setTempo(result);
    });
  }

  return { tempo, cacheHit, applyOverride, clearOverride };
}
