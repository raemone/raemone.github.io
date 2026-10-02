# Portfolio — raemone.github.io

A static, bilingual (EN/FR) personal site. No backend, no database: every piece
of content lives in a JSON file under `src/data/`, and the whole site is
pre-rendered to plain HTML at build time.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | [Astro 5](https://astro.build) | Static output, ships ~0 KB JS by default, first-class GitHub Pages support |
| Styling | Tailwind v4 | Design tokens in `src/styles/global.css`, light/dark via one `data-theme` attribute |
| Interactivity | React 19 islands | Only the map and the ⌘K palette hydrate; everything else is static HTML |
| Content | JSON + [Zod](https://zod.dev) | A typo in a data file fails the build with the file and field named |
| Map | `d3-geo` + `world-atlas` | Projected **at build time** — no tile server, no API key, no map library in the browser |
| Fonts | `@fontsource-variable` | Self-hosted; no Google Fonts request at runtime |
| Tests | Vitest | `npm test` |

## Commands

```bash
npm install          # once
npm run dev          # dev server at http://localhost:4321
npm run build        # type-check, then build to dist/
npm run preview      # serve dist/ locally
npm test             # run the test suite
npm run sync:articles # refresh RSS-sourced articles (see below)
npm run sync:badges   # refresh Credly badges and their images (see below)
```

## Editing content

Everything you will want to change is in `src/data/`. Search the repo for
`TODO —` to find every placeholder.

| File | Holds |
| --- | --- |
| `profile.json` | Name, headline, tagline, bio, where you are from and live, photos, languages, community and advisory roles |
| `contact.json` | Email, social links, and the **open to work / speaking / advising** flags |
| `experience.json` | Roles, in any order — the site sorts them |
| `projects.json` | Engagements, including the `lat`/`lng` that place each map pin |
| `articles.json` | Articles and posts |
| `talks.json` | Conferences and webinars; upcoming vs past is derived from the date |
| `feeds.json` | RSS feeds to poll for new articles |
| `badges.json` | Credly badges — **generated**, do not hand-edit; run `npm run sync:badges` |
| `code-samples.json` | Agent skills, topic snippets and side projects, each with one category and any number of platforms |

### Bilingual fields

Any text field takes either a bare string (identical in both languages) or a
pair:

```jsonc
"company": "Microsoft",                                  // same in EN and FR
"title": { "en": "Architect", "fr": "Architecte" }       // translated
```

### Adding a project to the map

Add an entry to `projects.json` with its real coordinates. The pin, the country
and customer counters, the filters and the search index all update from that one
entry — nothing else to touch.

Set `"customerPublic": false` for an engagement under NDA and the site shows
"Confidential customer" instead of the name, in both languages.

### The "open to work" badge

One flag in `contact.json` drives the pill in the header area, the footer and the
contact page:

```jsonc
"availability": { "openToWork": true, ... }
```

### Photos

Replace the placeholders in `public/images/` and point `profile.json` at the new
filenames. Portrait is used at 4:5, gallery images at 4:3.

## Auto-updating articles

`scripts/sync-articles.mjs` fetches the feeds listed in `src/data/feeds.json`,
converts each item into an article entry and rewrites `articles.json`.

- Entries it creates are marked `"auto": true` and are **replaced** on every run.
- Entries you wrote by hand (`"auto": false`) are **never touched** — LinkedIn
  publishes no RSS, so those posts have to stay manual.
- A hand-written entry always wins over the same URL from a feed.

To switch it on: set `"enabled": true` on a feed and replace the placeholder URL.
`.github/workflows/sync-articles.yml` then runs it every Monday at 06:00 UTC and
commits any change, which triggers a redeploy.

### Credly badges

`npm run sync:badges` reads the public Credly profile, writes `src/data/badges.json`
and stores a downscaled copy of each badge image in `public/images/badges/`.

The images live in this repository on purpose. Credly's own embed is a
third-party script that sets cookies, and hot-linking the images would still
announce every reader to Credly. Storing them means the About page makes no
third-party request at all — the only Credly URLs in the build are the
verification links on each badge, which fire only when someone clicks one.

Run it after earning a badge. Images for badges that are no longer public are
pruned on the next run.

## Deployment

`.github/workflows/deploy.yml` (at the repository root) runs on every push to
`main`. It type-checks, tests, builds, then assembles the published site as:

- everything already at the repository root (the existing demo pages, listed at
  `/demos.html`) — copied untouched
- this portfolio at the site root, overlaid on top, supplying `index.html` and
  the site-wide `404.html`
- a redirect at `/whois/`, where the portfolio used to live, for links already
  shared; safe to delete once those have aged out

**One-time setup:** in the repository's *Settings → Pages*, set **Source** to
**GitHub Actions**. Until that is changed, Pages keeps serving the `main` branch
directly and the workflow's output is ignored.

## Notes

- The OG social images are rendered at build time by `astro-og-canvas`, which
  downloads two Inter font files on the first build and caches them under
  `node_modules/.astro-og-canvas`. That is a build-time fetch only; nothing is
  requested from the browser.
- Theme choice is stored in `localStorage` and applied by an inline script before
  first paint, so there is no flash of the wrong theme.
- Every animation is behind `prefers-reduced-motion`.
