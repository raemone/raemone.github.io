import { OGImageRoute } from 'astro-og-canvas';
import { PAGES } from '@/lib/pages';
import { LANGUAGES, ui } from '@/i18n/ui';
import { profile } from '@/lib/content';

interface OgPage {
  title: string;
  description: string;
}

/**
 * One social card per page per language, rendered at build time. The keys match
 * the `og/<lang>/<pageId>.png` path that BaseLayout points its meta tags at.
 */
const pages: Record<string, OgPage> = Object.fromEntries(
  LANGUAGES.flatMap((lang) =>
    PAGES.map((page) => [
      `${lang}/${page.id}`,
      {
        title: page.id === 'home' ? profile.name : ui[page.labelKey][lang],
        description: page.id === 'home' ? profile.headline[lang] : page.description[lang],
      },
    ]),
  ),
);

// Fetched once at build time and cached under node_modules/.astro-og-canvas;
// nothing here is requested by the browser.
const FONT_URLS = [
  'https://api.fontsource.org/v1/fonts/inter/latin-400-normal.ttf',
  'https://api.fontsource.org/v1/fonts/inter/latin-700-normal.ttf',
];

export const { getStaticPaths, GET } = await OGImageRoute<OgPage>({
  pages,
  getSlug: (path) => `${path}.png`,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [
      [15, 17, 22],
      [26, 29, 41],
    ],
    border: { color: [99, 102, 241], width: 10, side: 'inline-start' },
    padding: 72,
    fonts: FONT_URLS,
    font: {
      title: { size: 62, weight: 'Bold', color: [250, 250, 252], lineHeight: 1.15, families: ['Inter'] },
      description: { size: 30, weight: 'Normal', color: [158, 164, 180], lineHeight: 1.4, families: ['Inter'] },
    },
  }),
});
