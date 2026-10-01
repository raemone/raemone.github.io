#!/usr/bin/env node
/**
 * Refreshes src/data/badges.json from the public Credly profile, and copies
 * each badge image into public/images/badges/.
 *
 * The images are stored in the repository rather than hot-linked so the About
 * page makes no third-party request at runtime: no Credly embed script, no
 * cookies, nothing for a reader to be tracked by. They are downscaled on the
 * way in because Credly serves them at roughly 600px and the page shows them
 * at a fraction of that.
 *
 * Run with `npm run sync:badges` after earning a badge.
 */

import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const badgesPath = resolve(here, '..', 'src', 'data', 'badges.json');
const imageDir = resolve(here, '..', 'public', 'images', 'badges');

const CREDLY_USER = 'remi-dyon';
const FETCH_TIMEOUT_MS = 20_000;
/** Rendered at 72px, so this covers a 2x display without carrying 600px files. */
const IMAGE_SIZE = 160;

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** Credly nests the issuing organisation a few levels down. */
function issuerName(template) {
  const entities = template?.issuer?.entities ?? [];
  for (const entry of entities) {
    const name = entry?.entity?.name;
    if (name) return name;
  }
  return null;
}

async function fetchBadges() {
  const url = `https://www.credly.com/users/${CREDLY_USER}/badges.json?page=1&page_size=100`;
  const response = await fetchWithTimeout(url, { headers: { accept: 'application/json' } });
  const payload = await response.json();

  const badges = [];
  for (const item of payload.data ?? []) {
    // A badge the earner has hidden, or not yet accepted, is not ours to show.
    if (item.public !== true || item.is_private_badge === true) continue;
    if (item.state !== 'accepted') continue;

    const template = item.badge_template ?? {};
    const name = template.name;
    const issuer = issuerName(template);
    const issued = item.issued_at_date;
    const imageUrl = template.image_url ?? item.image_url;

    if (!name || !issuer || !issued || !imageUrl) {
      console.warn(`  ! skipped a badge with incomplete data: ${name ?? item.id}`);
      continue;
    }

    badges.push({
      id: item.id,
      name,
      issuer,
      issued,
      url: `https://www.credly.com/badges/${item.id}/public_url`,
      image: `images/badges/${item.id}.png`,
      imageUrl,
    });
  }

  badges.sort((a, b) => b.issued.localeCompare(a.issued) || a.name.localeCompare(b.name));
  return badges;
}

async function downloadImage(badge) {
  const response = await fetchWithTimeout(badge.imageUrl);
  const original = Buffer.from(await response.arrayBuffer());
  const resized = await sharp(original)
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(resolve(imageDir, `${badge.id}.png`), resized);
  return { before: original.length, after: resized.length };
}

/** Drops images for badges that are no longer on the profile. */
async function pruneImages(keepIds) {
  const existing = await readdir(imageDir).catch(() => []);
  let removed = 0;
  for (const file of existing) {
    if (!file.endsWith('.png')) continue;
    if (keepIds.has(file.replace(/\.png$/, ''))) continue;
    await unlink(resolve(imageDir, file));
    removed += 1;
  }
  return removed;
}

async function main() {
  await mkdir(imageDir, { recursive: true });

  const badges = await fetchBadges();
  if (badges.length === 0) throw new Error('Credly returned no public badges — refusing to write an empty file.');

  let before = 0;
  let after = 0;
  for (const badge of badges) {
    const size = await downloadImage(badge);
    before += size.before;
    after += size.after;
    console.log(`  ${badge.issued}  ${badge.name}`);
  }

  const removed = await pruneImages(new Set(badges.map((badge) => badge.id)));

  // imageUrl is only needed while downloading; the site reads the local path.
  const records = badges.map(({ imageUrl, ...rest }) => rest);
  await writeFile(badgesPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');

  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
  console.log(`\n${badges.length} badges written to src/data/badges.json`);
  console.log(`images: ${kb(before)} from Credly → ${kb(after)} stored`);
  if (removed > 0) console.log(`pruned ${removed} image(s) for badges no longer listed`);
}

main().catch((error) => {
  console.error(`sync:badges failed — ${error.message}`);
  process.exitCode = 1;
});
