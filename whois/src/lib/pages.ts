import type { Lang, UiKey } from '@/i18n/ui';

export type PageId = 'home' | 'about' | 'experience' | 'projects' | 'writing' | 'speaking' | 'contact' | 'resume';

export interface PageDef {
  id: PageId;
  /** Unprefixed, English-form path. Language and base prefixes are added by `localizePath`. */
  path: string;
  labelKey: UiKey;
  /** Résumé is reachable from the footer and the palette, but is not a top-level nav item. */
  inNav: boolean;
  description: Record<Lang, string>;
}

export const PAGES: PageDef[] = [
  {
    id: 'home',
    path: '/',
    labelKey: 'nav.home',
    inNav: true,
    description: {
      en: 'Principal Solution Architect working on Copilot Studio at Microsoft.',
      fr: 'Architecte de solutions principal sur Copilot Studio chez Microsoft.',
    },
  },
  {
    id: 'about',
    path: '/about',
    labelKey: 'nav.about',
    inNav: true,
    description: {
      en: 'Where I am from, where I live, and how I ended up doing this.',
      fr: 'Mes origines, où je vis, et comment j’en suis arrivé là.',
    },
  },
  {
    id: 'experience',
    path: '/experience',
    labelKey: 'nav.experience',
    inNav: true,
    description: {
      en: 'Roles, responsibilities and what I shipped along the way.',
      fr: 'Postes, responsabilités et réalisations au fil du parcours.',
    },
  },
  {
    id: 'projects',
    path: '/projects',
    labelKey: 'nav.projects',
    inNav: true,
    description: {
      en: 'Customer engagements around the world, plotted on a map.',
      fr: 'Missions clients à travers le monde, situées sur une carte.',
    },
  },
  {
    id: 'writing',
    path: '/writing',
    labelKey: 'nav.writing',
    inNav: true,
    description: {
      en: 'Articles and posts on conversational AI, agents and the Power Platform.',
      fr: 'Articles sur l’IA conversationnelle, les agents et la Power Platform.',
    },
  },
  {
    id: 'speaking',
    path: '/speaking',
    labelKey: 'nav.speaking',
    inNav: true,
    description: {
      en: 'Conferences, user groups and webinars, upcoming and past.',
      fr: 'Conférences, groupes d’utilisateurs et webinaires, à venir et passés.',
    },
  },
  {
    id: 'contact',
    path: '/contact',
    labelKey: 'nav.contact',
    inNav: true,
    description: {
      en: 'How to reach me and what I am currently open to.',
      fr: 'Comment me joindre et ce à quoi je suis ouvert actuellement.',
    },
  },
  {
    id: 'resume',
    path: '/resume',
    labelKey: 'nav.resume',
    inNav: false,
    description: {
      en: 'A one-page résumé, generated from the same data as this site.',
      fr: 'Un CV d’une page, généré à partir des mêmes données que ce site.',
    },
  },
];

export const NAV_PAGES = PAGES.filter((page) => page.inNav);

export function getPage(id: PageId): PageDef {
  const page = PAGES.find((candidate) => candidate.id === id);
  if (!page) throw new Error(`Unknown page id: ${id}`);
  return page;
}
