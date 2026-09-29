import type { GetStaticPaths } from 'astro';
import { DEFAULT_LANG, LANGUAGES } from '@/i18n/ui';
import type { Lang } from '@/i18n/ui';

/**
 * One entry per locale for the `[...lang]` rest route. The default locale maps
 * to an undefined param so it is served without a prefix, matching the
 * `prefixDefaultLocale: false` setting in astro.config.mjs.
 */
export const langStaticPaths: GetStaticPaths = () =>
  LANGUAGES.map((lang) => ({
    params: { lang: lang === DEFAULT_LANG ? undefined : lang },
    props: { lang } as { lang: Lang },
  }));
