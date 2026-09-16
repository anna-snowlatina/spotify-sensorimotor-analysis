import { describe, it, expect, vi, beforeEach } from 'vitest';

const reccoMock = vi.fn();
const deezerMock = vi.fn();

vi.mock('../src/tempo/providers/reccobeats', () => ({
  lookupReccoBeats: (...args: unknown[]) => reccoMock(...args),
}));
vi.mock('../src/tempo/providers/deezer', () => ({
  lookupDeezer: (...args: unknown[]) => deezerMock(...args),
}));

// Imported after the mocks so lookup.ts picks up the mocked provider modules.
const { lookupTempo, applyOctaveOverride, clearOctaveOverride } = await import('../src/tempo/lookup');

beforeEach(() => {
  localStorage.clear();
  reccoMock.mockReset();
  deezerMock.mockReset();
});

describe('lookupTempo', () => {
  it('uses ReccoBeats on a hit', async () => {
    reccoMock.mockResolvedValue({ bpm: 128, energy: 0.7, valence: 0.4 });
    deezerMock.mockResolvedValue(null);
    const result = await lookupTempo({ trackId: 't1', isrc: 'ISRC1', itemType: 'track' });
    expect(result).toEqual({ bpm: 128, energy: 0.7, valence: 0.4, source: 'reccobeats' });
  });

  it('falls back to Deezer when ReccoBeats 404s (returns null)', async () => {
    reccoMock.mockResolvedValue(null);
    deezerMock.mockResolvedValue({ bpm: 95 });
    const result = await lookupTempo({ trackId: 't2', isrc: 'ISRC2', itemType: 'track' });
    expect(result).toEqual({ bpm: 95, source: 'deezer' });
  });

  it('treats Deezer bpm: 0 (already normalized to null by the provider) as unknown', async () => {
    reccoMock.mockResolvedValue(null);
    deezerMock.mockResolvedValue({ bpm: null });
    const result = await lookupTempo({ trackId: 't3', isrc: 'ISRC3', itemType: 'track' });
    expect(result).toEqual({ bpm: null, source: 'none' });
  });

  it('treats a provider timeout (resolves null) the same as a miss', async () => {
    reccoMock.mockResolvedValue(null);
    deezerMock.mockResolvedValue(null);
    const result = await lookupTempo({ trackId: 't4', isrc: 'ISRC4', itemType: 'track' });
    expect(result.source).toBe('none');
    expect(result.bpm).toBeNull();
  });

  it('prefers ReccoBeats when the two providers report an octave-pair (~2x) mismatch', async () => {
    reccoMock.mockResolvedValue({ bpm: 70 });
    deezerMock.mockResolvedValue({ bpm: 140 });
    const result = await lookupTempo({ trackId: 't5', isrc: 'ISRC5', itemType: 'track' });
    expect(result.bpm).toBe(70);
    expect(result.source).toBe('reccobeats');
  });

  it('rejects out-of-range BPM values (outside 50-210) as unknown', async () => {
    reccoMock.mockResolvedValue({ bpm: 400 });
    deezerMock.mockResolvedValue(null);
    const result = await lookupTempo({ trackId: 't6', isrc: 'ISRC6', itemType: 'track' });
    expect(result).toEqual({ bpm: null, source: 'none' });
  });

  it('skips the lookup entirely for episodes', async () => {
    const result = await lookupTempo({ trackId: 'ep1', itemType: 'episode' });
    expect(result).toEqual({ bpm: null, source: 'none' });
    expect(reccoMock).not.toHaveBeenCalled();
    expect(deezerMock).not.toHaveBeenCalled();
  });

  it('returns the cached result on a second call without hitting providers again', async () => {
    reccoMock.mockResolvedValue({ bpm: 110 });
    deezerMock.mockResolvedValue(null);
    await lookupTempo({ trackId: 't7', isrc: 'ISRC7', itemType: 'track' });
    reccoMock.mockClear();
    deezerMock.mockClear();

    const second = await lookupTempo({ trackId: 't7', isrc: 'ISRC7', itemType: 'track' });
    expect(second.bpm).toBe(110);
    expect(reccoMock).not.toHaveBeenCalled();
    expect(deezerMock).not.toHaveBeenCalled();
  });
});

describe('octave override precedence', () => {
  it('an applied override takes priority over a later lookup', async () => {
    reccoMock.mockResolvedValue({ bpm: 100 });
    deezerMock.mockResolvedValue(null);
    await lookupTempo({ trackId: 't8', isrc: 'ISRC8', itemType: 'track' });

    const overridden = applyOctaveOverride('t8', 100, 'half');
    expect(overridden).toEqual({ bpm: 50, source: 'override' });

    reccoMock.mockClear();
    const afterOverride = await lookupTempo({ trackId: 't8', isrc: 'ISRC8', itemType: 'track' });
    expect(afterOverride).toEqual({ bpm: 50, source: 'override' });
    expect(reccoMock).not.toHaveBeenCalled();
  });

  it('clearing an override lets a fresh lookup run again', async () => {
    reccoMock.mockResolvedValue({ bpm: 100 });
    deezerMock.mockResolvedValue(null);
    applyOctaveOverride('t9', 100, 'double');
    clearOctaveOverride('t9');

    reccoMock.mockResolvedValue({ bpm: 130 });
    const result = await lookupTempo({ trackId: 't9', isrc: 'ISRC9', itemType: 'track' });
    expect(result.bpm).toBe(130);
    expect(result.source).toBe('reccobeats');
  });
});
