/**
 * Search types and matching logic, deliberately free of any content import.
 *
 * The ⌘K palette runs in the browser and only needs these functions. Keeping
 * them out of `search.ts` — which imports every data file and Zod to build the
 * index — stops that whole content layer from being bundled into the island.
 */

export type SearchGroup = 'pages' | 'projects' | 'articles' | 'talks';

export interface SearchItem {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  href: string;
  /** Lowercased haystack the palette matches against, so matching needs no extra work at runtime. */
  keywords: string;
  external: boolean;
}

const WORD_CHARACTER = /[a-z0-9]/;

/**
 * Primary matcher: every whitespace-separated word of the query must appear as
 * a literal substring. This is what makes results predictable — searching
 * "paris" returns the Paris engagement, not every entry whose letters happen to
 * spell p-a-r-i-s across three fields.
 *
 * Lower is better. Matches that start at a word boundary are strongly preferred
 * over ones buried mid-word.
 */
export function matchScore(haystackText: string, query: string): number | null {
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let total = 0;
  for (const word of words) {
    const found = haystackText.indexOf(word);
    if (found === -1) return null;
    const atWordStart = found === 0 || !WORD_CHARACTER.test(haystackText[found - 1]);
    total += found + (atWordStart ? 0 : 500);
  }

  return total;
}

/**
 * Fallback matcher: every character of the query must appear in order, which
 * makes `cpst` find "Copilot Studio". Only consulted when nothing matches
 * literally, so its looseness never dilutes a good result set.
 */
export function fuzzyScore(haystackText: string, query: string): number | null {
  if (query === '') return 0;
  let haystackIndex = 0;
  let score = 0;
  let previousMatch = -1;

  for (const char of query) {
    const found = haystackText.indexOf(char, haystackIndex);
    if (found === -1) return null;
    // Penalise gaps, so contiguous runs beat scattered letters.
    score += previousMatch === -1 ? found : found - previousMatch - 1;
    previousMatch = found;
    haystackIndex = found + 1;
  }

  return score;
}

function rank(
  items: SearchItem[],
  query: string,
  score: (haystackText: string, query: string) => number | null,
  limit: number,
): SearchItem[] {
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const value = score(item.keywords, query);
    if (value !== null) scored.push({ item, score: value });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((entry) => entry.item);
}

export function searchItems(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const normalised = query.trim().toLowerCase();
  if (normalised === '') return items.filter((item) => item.group === 'pages');

  const literal = rank(items, normalised, matchScore, limit);
  if (literal.length > 0) return literal;

  // Nothing matched literally — fall back to acronym-style subsequence matching
  // so a typo or an initialism still finds something.
  return rank(items, normalised, fuzzyScore, limit);
}
