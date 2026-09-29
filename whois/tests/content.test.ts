import { describe, expect, it } from 'vitest';
import {
  articles,
  computeStats,
  education,
  featuredArticles,
  industryOptions,
  profile,
  projects,
  publishedHighlights,
  roles,
  splitTalks,
  talks,
  yearOptions,
} from '@/lib/content';
import type { Article, Talk } from '@/lib/schema';

/** Exercises the real data files, so a bad edit fails the suite as well as the build. */
describe('data files', () => {
  it('parse without throwing', () => {
    expect(profile.name).not.toBe('');
    expect(roles.length).toBeGreaterThan(0);
    expect(projects.length).toBeGreaterThan(0);
  });

  it('use unique ids, which the map and anchors depend on', () => {
    const collect = (items: { id: string }[]) => items.map((item) => item.id);
    for (const items of [roles, projects, articles, talks]) {
      const ids = collect(items);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never lists the same article twice, under any source', () => {
    const urls = articles.map((article) => article.url);
    expect(new Set(urls).size).toBe(urls.length);
    const titles = articles.map((article) => article.title.en.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('marks exactly one role as current', () => {
    expect(roles.filter((role) => role.current)).toHaveLength(1);
  });
});

describe('sorting', () => {
  it('puts the current role first', () => {
    expect(roles[0].current).toBe(true);
  });

  it('orders projects newest first', () => {
    const years = projects.map((project) => project.year);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });

  it('orders articles newest first', () => {
    const dates = articles.map((article) => article.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

function makeTalk(id: string, date: string, endDate?: string): Talk {
  return {
    id,
    event: 'Event',
    title: { en: 'T', fr: 'T' },
    abstract: { en: 'A', fr: 'A' },
    date,
    endDate,
    city: 'City',
    country: 'Country',
    format: 'session',
  };
}

describe('splitTalks', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  it('treats a talk later today as upcoming', () => {
    const { upcoming, past } = splitTalks([makeTalk('a', '2026-06-15')], now);
    expect(upcoming.map((talk) => talk.id)).toEqual(['a']);
    expect(past).toHaveLength(0);
  });

  it('keeps a multi-day event upcoming until its last day passes', () => {
    const ongoing = makeTalk('b', '2026-06-13', '2026-06-17');
    const { upcoming } = splitTalks([ongoing], now);
    expect(upcoming.map((talk) => talk.id)).toEqual(['b']);
  });

  it('moves a finished multi-day event into the past', () => {
    const finished = makeTalk('c', '2026-06-10', '2026-06-14');
    const { past } = splitTalks([finished], now);
    expect(past.map((talk) => talk.id)).toEqual(['c']);
  });

  it('sorts upcoming talks soonest first', () => {
    const { upcoming } = splitTalks(
      [makeTalk('late', '2026-12-01'), makeTalk('soon', '2026-07-01')],
      now,
    );
    expect(upcoming.map((talk) => talk.id)).toEqual(['soon', 'late']);
  });
});

function makeArticle(id: string, featured: boolean): Article {
  return {
    id,
    title: { en: 'T', fr: 'T' },
    url: 'https://example.com',
    source: 'LinkedIn',
    date: '2025-01-01',
    excerpt: { en: 'E', fr: 'E' },
    tags: [],
    featured,
    auto: false,
  };
}

describe('featuredArticles', () => {
  it('lifts featured entries above the rest', () => {
    const list = [makeArticle('a', false), makeArticle('b', true), makeArticle('c', false)];
    expect(featuredArticles(3, list).map((article) => article.id)).toEqual(['b', 'a', 'c']);
  });

  it('respects the limit', () => {
    const list = [makeArticle('a', false), makeArticle('b', true), makeArticle('c', false)];
    expect(featuredArticles(1, list)).toHaveLength(1);
  });

  it('returns everything it has when asked for more than exists', () => {
    expect(featuredArticles(99, [makeArticle('a', false)])).toHaveLength(1);
  });
});

describe('filter options', () => {
  it('lists each industry once', () => {
    const keys = industryOptions().map((option) => option.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lists years newest first with no duplicates', () => {
    const years = yearOptions();
    expect([...years].sort((a, b) => b - a)).toEqual(years);
    expect(new Set(years).size).toBe(years.length);
  });
});

describe('computeStats', () => {
  it('counts distinct countries and customers rather than rows', () => {
    const stats = computeStats(new Date('2026-06-15T00:00:00Z'));
    expect(stats.countries).toBeLessThanOrEqual(stats.projects);
    expect(stats.customers).toBeLessThanOrEqual(stats.projects);
  });

  it('derives years in tech from the earliest role', () => {
    const stats = computeStats(new Date('2026-06-15T00:00:00Z'));
    const earliest = Math.min(
      ...roles.filter((role) => role.start !== 'present').map((role) => Number(role.start.slice(0, 4))),
    );
    expect(stats.years).toBe(2026 - earliest);
  });

  it('never reports a negative number of years', () => {
    expect(computeStats(new Date('2000-01-01T00:00:00Z')).years).toBeGreaterThanOrEqual(0);
  });
});

describe('education', () => {
  it('parses and lists every entry', () => {
    expect(education.length).toBeGreaterThan(0);
  });

  it('orders entries most recent first', () => {
    const ends = education.map((entry) => entry.end);
    expect([...ends].sort().reverse()).toEqual(ends);
  });

  it('never ends before it starts', () => {
    for (const entry of education) {
      expect(Number(entry.end)).toBeGreaterThanOrEqual(Number(entry.start));
    }
  });

  it('uses unique ids', () => {
    const ids = education.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('publishedHighlights', () => {
  const role = roles[0];

  it('strips unfilled TODO placeholders so they never reach the live site', () => {
    for (const lang of ['en', 'fr'] as const) {
      for (const highlight of publishedHighlights(role, lang)) {
        expect(highlight.startsWith('TODO')).toBe(false);
      }
    }
  });

  it('leaves real highlights untouched', () => {
    const written = roles.find((r) => r.id === 'microsoft-senior-technical-specialist');
    expect(written && publishedHighlights(written, 'en').length).toBeGreaterThan(0);
  });

  it('never publishes a TODO from any role, in either language', () => {
    const all = roles.flatMap((r) => [...publishedHighlights(r, 'en'), ...publishedHighlights(r, 'fr')]);
    expect(all.filter((h) => h.includes('TODO'))).toEqual([]);
  });
});
