import { articles, projects, talks } from './content';
import { PAGES } from './pages';
import { localizePath, pick, t } from '@/i18n';
import type { Lang } from '@/i18n/ui';
import type { SearchItem } from './search-match';

// Re-exported so server-side callers have a single import, while the browser
// island imports `search-match` directly and never pulls in the data files.
export { fuzzyScore, matchScore, searchItems } from './search-match';
export type { SearchGroup, SearchItem } from './search-match';

function haystack(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Flattens every piece of content into a single searchable list for the ⌘K
 * palette. Built at compile time and serialised into the page, so the palette
 * needs no network request and works offline.
 */
export function buildSearchIndex(lang: Lang, base?: string): SearchItem[] {
  const pageItems: SearchItem[] = PAGES.map((page) => ({
    id: `page-${page.id}`,
    group: 'pages',
    title: t(page.labelKey, lang),
    subtitle: page.description[lang],
    href: localizePath(page.path, lang, base),
    keywords: haystack(t(page.labelKey, lang), page.description[lang], page.id),
    external: false,
  }));

  const projectsHref = localizePath('/projects', lang, base);
  const projectItems: SearchItem[] = projects.map((project) => {
    const customer = project.customerPublic ? project.customer : t('projects.confidential', lang);
    return {
      id: `project-${project.id}`,
      group: 'projects',
      title: pick(project.project, lang),
      subtitle: `${customer} · ${project.city}, ${project.country} · ${project.year}`,
      href: `${projectsHref}#${project.id}`,
      keywords: haystack(
        pick(project.project, lang),
        pick(project.description, lang),
        customer,
        project.city,
        project.country,
        pick(project.industry, lang),
        project.tech.join(' '),
        String(project.year),
      ),
      external: false,
    };
  });

  const articleItems: SearchItem[] = articles.map((article) => ({
    id: `article-${article.id}`,
    group: 'articles',
    title: pick(article.title, lang),
    subtitle: `${article.source} · ${article.date}`,
    href: article.url,
    keywords: haystack(
      pick(article.title, lang),
      pick(article.excerpt, lang),
      article.source,
      article.tags.join(' '),
    ),
    external: true,
  }));

  const speakingHref = localizePath('/speaking', lang, base);
  const talkItems: SearchItem[] = talks.map((talk) => ({
    id: `talk-${talk.id}`,
    group: 'talks',
    title: pick(talk.title, lang),
    subtitle: `${talk.event} · ${talk.city}, ${talk.country} · ${talk.date}`,
    href: `${speakingHref}#${talk.id}`,
    keywords: haystack(
      pick(talk.title, lang),
      pick(talk.abstract, lang),
      talk.event,
      talk.city,
      talk.country,
      talk.format,
    ),
    external: false,
  }));

  return [...pageItems, ...projectItems, ...articleItems, ...talkItems];
}
