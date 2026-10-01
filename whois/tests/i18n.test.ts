import { describe, expect, it } from 'vitest';
import {
  assetPath,
  formatMonth,
  isLang,
  localizePath,
  normaliseBase,
  resolveLang,
  switchLangPath,
} from '@/i18n';

/**
 * A sub-path base. The site itself is served from the root, covered by the
 * `root base` block below, but the helpers must stay base-agnostic so the
 * portfolio can be mounted under a prefix again without code changes.
 */
const BASE = '/whois';

/** What `normaliseBase` produces for the configured `base: '/'`. */
const ROOT = '';

describe('normaliseBase', () => {
  it('adds a leading slash and strips trailing ones', () => {
    expect(normaliseBase('whois/')).toBe('/whois');
    expect(normaliseBase('/whois///')).toBe('/whois');
    expect(normaliseBase('/whois')).toBe('/whois');
  });

  it('collapses a root base to an empty string so paths do not double up', () => {
    expect(normaliseBase('/')).toBe('');
    expect(normaliseBase('')).toBe('');
  });
});

describe('isLang / resolveLang', () => {
  it('recognises the configured locales only', () => {
    expect(isLang('en')).toBe(true);
    expect(isLang('fr')).toBe(true);
    expect(isLang('de')).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });

  it('treats an absent route param as the default locale', () => {
    expect(resolveLang(undefined)).toBe('en');
    expect(resolveLang('fr')).toBe('fr');
    // An unknown segment must not produce a broken locale.
    expect(resolveLang('de')).toBe('en');
  });
});

describe('localizePath', () => {
  it('leaves the default locale unprefixed', () => {
    expect(localizePath('/', 'en', BASE)).toBe('/whois');
    expect(localizePath('/projects', 'en', BASE)).toBe('/whois/projects');
  });

  it('prefixes non-default locales', () => {
    expect(localizePath('/', 'fr', BASE)).toBe('/whois/fr');
    expect(localizePath('/projects', 'fr', BASE)).toBe('/whois/fr/projects');
  });

  it('tolerates paths written with or without slashes', () => {
    expect(localizePath('projects', 'en', BASE)).toBe('/whois/projects');
    expect(localizePath('/projects/', 'en', BASE)).toBe('/whois/projects');
  });

  it('never returns an empty href when there is no base', () => {
    expect(localizePath('/', 'en', '')).toBe('/');
  });
});

describe('switchLangPath', () => {
  it('keeps the reader on the same page when switching language', () => {
    expect(switchLangPath('/whois/projects', 'fr', BASE)).toBe('/whois/fr/projects');
    expect(switchLangPath('/whois/fr/projects', 'en', BASE)).toBe('/whois/projects');
  });

  it('handles the home page in both directions', () => {
    expect(switchLangPath('/whois', 'fr', BASE)).toBe('/whois/fr');
    expect(switchLangPath('/whois/fr', 'en', BASE)).toBe('/whois');
  });

  it('is idempotent when the target language is already active', () => {
    expect(switchLangPath('/whois/fr/about', 'fr', BASE)).toBe('/whois/fr/about');
  });

  it('ignores a trailing slash on the current path', () => {
    expect(switchLangPath('/whois/about/', 'fr', BASE)).toBe('/whois/fr/about');
  });
});

describe('root base', () => {
  it('builds home and inner pages without a doubled slash', () => {
    expect(localizePath('/', 'en', ROOT)).toBe('/');
    expect(localizePath('/projects', 'en', ROOT)).toBe('/projects');
  });

  it('still prefixes non-default locales', () => {
    expect(localizePath('/', 'fr', ROOT)).toBe('/fr');
    expect(localizePath('/projects', 'fr', ROOT)).toBe('/fr/projects');
  });

  it('switches language on a root-served page', () => {
    expect(switchLangPath('/', 'fr', ROOT)).toBe('/fr');
    expect(switchLangPath('/fr', 'en', ROOT)).toBe('/');
    expect(switchLangPath('/projects', 'fr', ROOT)).toBe('/fr/projects');
    expect(switchLangPath('/fr/projects', 'en', ROOT)).toBe('/projects');
  });

  it('resolves assets from the root', () => {
    expect(assetPath('favicon.svg', ROOT)).toBe('/favicon.svg');
    expect(assetPath('/images/portrait.jpg', ROOT)).toBe('/images/portrait.jpg');
  });
});

describe('formatMonth', () => {
  it('renders a YYYY-MM boundary in the active locale', () => {
    expect(formatMonth('2024-01', 'en')).toMatch(/Jan/);
    expect(formatMonth('2024-01', 'fr')).toMatch(/janv/i);
  });

  it('renders the localised word for an ongoing role', () => {
    expect(formatMonth('present', 'en')).toBe('Present');
    expect(formatMonth('present', 'fr')).toBe('Aujourd’hui');
  });
});
