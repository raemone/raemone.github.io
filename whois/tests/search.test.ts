import { describe, expect, it } from 'vitest';
import { buildSearchIndex, fuzzyScore, matchScore, searchItems, type SearchItem } from '@/lib/search';

describe('matchScore', () => {
  it('matches a literal substring', () => {
    expect(matchScore('agent rollout paris retail', 'paris')).not.toBeNull();
  });

  it('rejects a scattered subsequence', () => {
    // p-a-r-i-s appears in order here, but not as a word.
    expect(matchScore('patient intake triage sydney australia', 'paris')).toBeNull();
  });

  it('prefers a match at a word boundary over one buried mid-word', () => {
    const boundary = matchScore('x paris', 'paris') as number;
    const buried = matchScore('xparis', 'paris') as number;
    expect(boundary).toBeLessThan(buried);
  });

  it('requires every word of a multi-word query', () => {
    expect(matchScore('agent rollout paris', 'paris agent')).not.toBeNull();
    expect(matchScore('agent rollout paris', 'paris berlin')).toBeNull();
  });
});

describe('fuzzyScore', () => {
  it('matches a contiguous substring with the best possible score', () => {
    expect(fuzzyScore('copilot studio', 'copilot')).toBe(0);
  });

  it('matches a scattered subsequence', () => {
    expect(fuzzyScore('copilot studio', 'cpst')).not.toBeNull();
  });

  it('scores a tighter match better than a looser one', () => {
    const tight = fuzzyScore('copilot studio', 'cop') as number;
    const loose = fuzzyScore('copilot studio', 'cst') as number;
    expect(tight).toBeLessThan(loose);
  });

  it('returns null when a character is missing', () => {
    expect(fuzzyScore('copilot studio', 'zebra')).toBeNull();
  });

  it('returns null when characters are present but out of order', () => {
    expect(fuzzyScore('abc', 'cba')).toBeNull();
  });

  it('treats an empty query as a trivial match', () => {
    expect(fuzzyScore('anything', '')).toBe(0);
  });
});

const items: SearchItem[] = [
  { id: '1', group: 'pages', title: 'Projects', subtitle: '', href: '/p', keywords: 'projects map', external: false },
  { id: '2', group: 'projects', title: 'Agent rollout', subtitle: '', href: '/p#a', keywords: 'agent rollout paris retail', external: false },
  { id: '3', group: 'articles', title: 'Post', subtitle: '', href: 'https://x', keywords: 'governance power platform', external: true },
];

describe('searchItems', () => {
  it('shows pages as the default, empty-query state', () => {
    const results = searchItems(items, '');
    expect(results).toHaveLength(1);
    expect(results[0].group).toBe('pages');
  });

  it('treats a whitespace-only query as empty', () => {
    expect(searchItems(items, '   ')).toHaveLength(1);
  });

  it('finds an item by a word in its keywords', () => {
    expect(searchItems(items, 'paris').map((item) => item.id)).toEqual(['2']);
  });

  it('is case insensitive', () => {
    expect(searchItems(items, 'PARIS').map((item) => item.id)).toEqual(['2']);
  });

  it('returns nothing when no item matches', () => {
    expect(searchItems(items, 'zzzz')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(searchItems(items, 'a', 1)).toHaveLength(1);
  });

  it('does not dilute literal matches with subsequence noise', () => {
    // 'paris' also spells out as a subsequence inside the other entries.
    expect(searchItems(items, 'paris').map((item) => item.id)).toEqual(['2']);
  });

  it('falls back to acronym matching when nothing matches literally', () => {
    const acronym = searchItems(
      [{ id: 'x', group: 'projects', title: 'T', subtitle: '', href: '/x', keywords: 'copilot studio', external: false }],
      'cpst',
    );
    expect(acronym.map((item) => item.id)).toEqual(['x']);
  });
});

describe('buildSearchIndex', () => {
  it('indexes every content type in both languages', () => {
    for (const lang of ['en', 'fr'] as const) {
      const index = buildSearchIndex(lang, '/whois');
      const groups = new Set(index.map((item) => item.group));
      expect(groups).toEqual(new Set(['pages', 'projects', 'articles', 'talks']));
    }
  });

  it('prefixes internal links with the base and locale', () => {
    const french = buildSearchIndex('fr', '/whois');
    const page = french.find((item) => item.id === 'page-projects');
    expect(page?.href).toBe('/whois/fr/projects');
  });

  it('leaves article links external and untouched', () => {
    const index = buildSearchIndex('en', '/whois');
    const article = index.find((item) => item.group === 'articles');
    expect(article?.external).toBe(true);
    expect(article?.href.startsWith('http')).toBe(true);
  });

  it('lowercases keywords so matching never has to', () => {
    for (const item of buildSearchIndex('en', '/whois')) {
      expect(item.keywords).toBe(item.keywords.toLowerCase());
    }
  });
});
