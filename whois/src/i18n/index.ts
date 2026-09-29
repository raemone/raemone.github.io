import { DEFAULT_LANG, LANGUAGES, ui, type Lang, type UiKey } from './ui';
import type { I18nString } from '@/lib/schema';

export { DEFAULT_LANG, LANGUAGES, LANGUAGE_NAMES, ui } from './ui';
export type { Lang, UiKey } from './ui';

/** The `base` from astro.config.mjs, always normalised to a leading slash and no trailing slash. */
export const BASE = normaliseBase(import.meta.env.BASE_URL ?? '/');

export function normaliseBase(base: string): string {
  const withLeading = base.startsWith('/') ? base : `/${base}`;
  const trimmed = withLeading.replace(/\/+$/, '');
  return trimmed === '' ? '' : trimmed;
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Resolves the active language from an Astro route param. The default locale is
 * served without a prefix, so an absent param means English.
 */
export function resolveLang(param: string | undefined): Lang {
  return isLang(param) ? param : DEFAULT_LANG;
}

/** Looks up a chrome string. Missing keys are a type error, so there is no runtime fallback. */
export function t(key: UiKey, lang: Lang): string {
  return ui[key][lang];
}

/** Reads the active language out of a bilingual content value. */
export function pick(value: I18nString, lang: Lang): string {
  return value[lang];
}

export function pickAll(value: { en: string[]; fr: string[] }, lang: Lang): string[] {
  return value[lang];
}

/**
 * Builds an absolute, base-aware URL for a site-relative path.
 *
 * `path` is always written in its unprefixed English form (`/projects`); the
 * language prefix is added here so callers never hardcode locale segments.
 */
export function localizePath(path: string, lang: Lang, base: string = BASE): string {
  const clean = path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`;
  const prefix = lang === DEFAULT_LANG ? '' : `/${lang}`;
  const result = `${base}${prefix}${clean}`;
  return result === '' ? '/' : result;
}

/** Asset URLs live under `base` but are never language-prefixed. */
export function assetPath(path: string, base: string = BASE): string {
  return `${base}/${path.replace(/^\/+/, '')}`;
}

/**
 * Maps the current pathname onto its counterpart in another language, so the
 * language switcher keeps the reader on the same page.
 */
export function switchLangPath(pathname: string, target: Lang, base: string = BASE): string {
  let rest = pathname;
  if (base && rest.startsWith(base)) rest = rest.slice(base.length);
  const segments = rest.split('/').filter(Boolean);
  if (isLang(segments[0])) segments.shift();
  return localizePath(`/${segments.join('/')}`, target, base);
}

const DATE_LOCALES: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR' };

export function formatDate(iso: string, lang: Lang, opts?: Intl.DateTimeFormatOptions): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
    ...opts,
  }).format(date);
}

/** Formats a `YYYY-MM` role boundary, or the localised word for an ongoing role. */
export function formatMonth(value: string, lang: Lang): string {
  if (value === 'present') return t('experience.present', lang);
  const [year, month] = value.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(DATE_LOCALES[lang]).format(value);
}
