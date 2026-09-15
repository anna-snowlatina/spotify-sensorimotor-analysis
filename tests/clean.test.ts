import { describe, it, expect } from 'vitest';
import { cleanTitle, stripVersionTags, normalizeChars } from '../src/sensory/clean';
import type { WordVectors } from '../src/sensory/clean';

const WORDS: WordVectors = {
  burn: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  room: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  live: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  something: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

describe('stripVersionTags', () => {
  it('removes bracketed feat/remaster tags', () => {
    expect(stripVersionTags('Burning Rooms (feat. Someone) - Remastered 2011')).toBe(
      'Burning Rooms',
    );
  });

  it('removes a "Live at ..." parenthetical', () => {
    expect(stripVersionTags('Something (Live at Somewhere)')).toBe('Something');
  });
});

describe('cleanTitle', () => {
  it('matches burn(ing) and room(s) after stripping version tags', () => {
    const result = cleanTitle('Burning Rooms (feat. Someone) - Remastered 2011', WORDS);
    const lemmas = result.matched.map((m) => m.lemma).sort();
    expect(lemmas).toEqual(['burn', 'room']);
    expect(result.unmatched).toEqual([]);
  });

  it('strips a "Live at Somewhere" tag entirely, matching only "something"', () => {
    const result = cleanTitle('Something (Live at Somewhere)', WORDS);
    expect(result.matched).toEqual([{ token: 'something', lemma: 'something' }]);
  });

  it('handles a title in another language with zero matches and no crash', () => {
    const result = cleanTitle('Cœur Brisé Sans Toi', WORDS);
    expect(result.matched).toEqual([]);
    expect(() => cleanTitle('こんにちは世界', WORDS)).not.toThrow();
  });

  it('returns an empty result for an all-stopword title', () => {
    const result = cleanTitle('The Of And', WORDS);
    expect(result.tokens).toEqual([]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it('normalizes curly apostrophes and drops possessive-only apostrophe tokens', () => {
    const normalized = normalizeChars('Burn’s Room');
    expect(normalized).toBe("Burn's Room");
    const result = cleanTitle("Burn's Room", WORDS);
    expect(result.matched.map((m) => m.lemma).sort()).toEqual(['burn', 'room']);
  });
});
