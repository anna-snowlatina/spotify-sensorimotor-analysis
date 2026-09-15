import { STOPWORDS } from './stopwords';

export type WordVectors = Record<string, number[]>;

export type CleanResult = {
  tokens: string[];
  matched: { token: string; lemma: string }[];
  unmatched: string[];
};

const VERSION_KEYWORDS = [
  'feat', 'ft.', 'with', 'remaster', 'remastered', 'live', 'version', 'edit', 'mix', 'remix',
  'mono', 'stereo', 'demo', 'acoustic', 'instrumental', 'bonus', 'deluxe', 'from', 'radio',
];

function containsVersionKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return VERSION_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Unicode NFKC normalization, curly apostrophes -> straight. */
export function normalizeChars(title: string): string {
  return title.normalize('NFKC').replace(/[‘’ʼ]/g, "'");
}

/** Removes bracketed/parenthesized segments and trailing " - ..." suffixes tagged as versions. */
export function stripVersionTags(title: string): string {
  let result = title.replace(/[([][^)\]]*[)\]]/g, (match) => (containsVersionKeyword(match) ? '' : match));

  // Repeatedly strip a trailing " - <segment>" if that segment names a version tag.
  let prev;
  do {
    prev = result;
    const m = result.match(/\s*-\s*([^-]+)$/);
    if (m && containsVersionKeyword(m[1])) {
      result = result.slice(0, m.index).trimEnd();
    }
  } while (result !== prev);

  return result.replace(/\s+/g, ' ').trim();
}

/** Lowercase, split on anything that isn't a letter or apostrophe. */
export function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean);
}

/** Strips a trailing "'s"; drops any token that still contains an apostrophe. */
export function handleApostrophes(tokens: string[]): string[] {
  return tokens
    .map((t) => (t.endsWith("'s") ? t.slice(0, -2) : t))
    .filter((t) => !t.includes("'"));
}

export function dropStopwords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t));
}

const FALLBACK_RULES: ((t: string) => string[])[] = [
  (t) => (t.endsWith('ing') ? [t.slice(0, -3), `${t.slice(0, -3)}e`] : []),
  (t) => (t.endsWith('ed') ? [t.slice(0, -2), `${t.slice(0, -2)}e`] : []),
  (t) => (t.endsWith('es') ? [t.slice(0, -2)] : []),
  (t) => (t.endsWith('s') ? [t.slice(0, -1)] : []),
  (t) => (t.endsWith('ly') ? [t.slice(0, -2)] : []),
];

/** Exact match first, then rule-based fallback forms in a fixed order. Returns the matched lemma or null. */
export function lookupToken(token: string, words: WordVectors): string | null {
  if (token in words) return token;
  for (const rule of FALLBACK_RULES) {
    for (const candidate of rule(token)) {
      if (candidate && candidate in words) return candidate;
    }
  }
  return null;
}

/** Runs the full cleaning + tokenization + lookup pipeline for one track title. */
export function cleanTitle(title: string, words: WordVectors): CleanResult {
  const normalized = normalizeChars(title);
  const stripped = stripVersionTags(normalized);
  const rawTokens = tokenize(stripped);
  const dedupApostrophes = handleApostrophes(rawTokens);
  const tokens = dropStopwords(dedupApostrophes);

  const matched: { token: string; lemma: string }[] = [];
  const unmatched: string[] = [];
  for (const token of tokens) {
    const lemma = lookupToken(token, words);
    if (lemma) matched.push({ token, lemma });
    else unmatched.push(token);
  }

  return { tokens, matched, unmatched };
}
