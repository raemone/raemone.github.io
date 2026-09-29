#!/usr/bin/env node
/**
 * Refreshes the RSS-sourced entries in src/data/articles.json.
 *
 * Hand-written entries (auto: false) are never touched — LinkedIn has no feed,
 * so those posts only exist because someone typed them. Entries previously
 * pulled from a feed (auto: true) are replaced wholesale on each run.
 *
 * Run locally with `npm run sync:articles`, or on a schedule via
 * .github/workflows/sync-articles.yml.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '..', 'src', 'data');
const feedsPath = resolve(dataDir, 'feeds.json');
const articlesPath = resolve(dataDir, 'articles.json');

const FETCH_TIMEOUT_MS = 15_000;
const EXCERPT_MAX_LENGTH = 220;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

/** Strips tags and collapses whitespace so a feed's HTML body becomes a plain excerpt. */
function toExcerpt(html) {
  if (!html) return '';
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= EXCERPT_MAX_LENGTH) return text;
  // Cut at a word boundary rather than mid-word.
  const truncated = text.slice(0, EXCERPT_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : EXCERPT_MAX_LENGTH)}…`;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Builds a stable, filename-safe id so re-runs do not churn the file. */
function toId(source, title) {
  const slug = `${source}-${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `auto-${slug}`;
}

function firstString(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === 'object') {
    if (typeof value['#text'] === 'string') return value['#text'];
    if (typeof value['@_href'] === 'string') return value['@_href'];
  }
  return '';
}

/** Normalises both RSS 2.0 `<item>` and Atom `<entry>` into one shape. */
function extractEntries(xml) {
  const parsed = parser.parse(xml);
  const rssItems = parsed?.rss?.channel?.item;
  const atomEntries = parsed?.feed?.entry;
  const raw = rssItems ?? atomEntries ?? [];
  const list = Array.isArray(raw) ? raw : [raw];

  return list
    .map((entry) => {
      const title = firstString(entry.title);
      const link = firstString(entry.link) || firstString(entry.id);
      const date =
        toIsoDate(firstString(entry.pubDate)) ??
        toIsoDate(firstString(entry.published)) ??
        toIsoDate(firstString(entry.updated));
      const body =
        firstString(entry.description) ||
        firstString(entry['content:encoded']) ||
        firstString(entry.summary) ||
        firstString(entry.content);

      // Atom nests the name inside <author>; RSS uses dc:creator or a bare <author>.
      const author =
        firstString(entry.author?.name) ||
        firstString(entry.author) ||
        firstString(entry['dc:creator']);

      return { title, link, date, excerpt: toExcerpt(body), author };
    })
    .filter((entry) => entry.title && entry.link && entry.date);
}

async function fetchFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'raemone.github.io article sync' },
    });

    if (!response.ok) {
      console.warn(`  ! ${feed.source}: HTTP ${response.status}, skipping`);
      return [];
    }

    let entries = extractEntries(await response.text());

    // A shared blog publishes everyone's posts on one feed, so keep only the
    // entries written by the configured author.
    if (feed.author) {
      const wanted = feed.author.toLowerCase();
      const before = entries.length;
      entries = entries.filter((entry) => entry.author.toLowerCase() === wanted);
      console.log(`  · ${feed.source}: ${before} entries, ${entries.length} by ${feed.author}`);
    }

    entries = entries.slice(0, feed.maxItems ?? 10);
    console.log(`  ✓ ${feed.source}: ${entries.length} entries`);

    return entries.map((entry) => ({
      id: toId(feed.source, entry.title),
      title: { en: entry.title, fr: entry.title },
      url: entry.link,
      source: feed.source,
      date: entry.date,
      excerpt: { en: entry.excerpt, fr: entry.excerpt },
      tags: [],
      featured: false,
      auto: true,
    }));
  } catch (error) {
    // A single unreachable feed must not fail the whole run, or one flaky host
    // would block the scheduled commit.
    console.warn(`  ! ${feed.source}: ${error instanceof Error ? error.message : error}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { feeds } = JSON.parse(await readFile(feedsPath, 'utf8'));
  const existing = JSON.parse(await readFile(articlesPath, 'utf8'));

  const manual = existing.filter((article) => !article.auto);
  const enabled = feeds.filter((feed) => feed.enabled);

  if (enabled.length === 0) {
    console.log('No feeds enabled in src/data/feeds.json — nothing to sync.');
    return;
  }

  console.log(`Syncing ${enabled.length} feed(s):`);
  const fetched = (await Promise.all(enabled.map(fetchFeed))).flat();

  // A hand-written entry always wins over the same URL from a feed.
  const manualUrls = new Set(manual.map((article) => article.url));
  const seen = new Set(manualUrls);
  const auto = [];
  for (const article of fetched) {
    if (seen.has(article.url)) continue;
    seen.add(article.url);
    auto.push(article);
  }

  const merged = [...manual, ...auto].sort((a, b) => b.date.localeCompare(a.date));
  const next = `${JSON.stringify(merged, null, 2)}\n`;

  if (next === (await readFile(articlesPath, 'utf8'))) {
    console.log('articles.json is already up to date.');
    return;
  }

  await writeFile(articlesPath, next, 'utf8');
  console.log(`Wrote ${merged.length} article(s) (${manual.length} manual, ${auto.length} synced).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
