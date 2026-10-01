import rawProfile from '@/data/profile.json';
import rawContact from '@/data/contact.json';
import rawRoles from '@/data/experience.json';
import rawProjects from '@/data/projects.json';
import rawArticles from '@/data/articles.json';
import rawTalks from '@/data/talks.json';
import rawEducation from '@/data/education.json';
import rawBadges from '@/data/badges.json';

import {
  articleSchema,
  badgeSchema,
  contactSchema,
  educationSchema,
  profileSchema,
  projectSchema,
  roleSchema,
  talkSchema,
  type Article,
  type Badge,
  type Education,
  type Project,
  type Role,
  type Talk,
} from './schema';
import { z } from 'astro/zod';
import type { Lang } from '@/i18n/ui';

/**
 * Parses a data file and rethrows with the filename attached. Without this, a
 * bad field in one of six JSON files produces an error that does not say which.
 */
function parseOrThrow<S extends z.ZodTypeAny>(schema: S, data: unknown, file: string): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid content in src/data/${file}:\n${issues}`);
}

export const profile = parseOrThrow(profileSchema, rawProfile, 'profile.json');
export const contact = parseOrThrow(contactSchema, rawContact, 'contact.json');
export const availability = contact.availability;

const allRoles = parseOrThrow(z.array(roleSchema), rawRoles, 'experience.json');
const allProjects = parseOrThrow(z.array(projectSchema), rawProjects, 'projects.json');
const allArticles = parseOrThrow(z.array(articleSchema), rawArticles, 'articles.json');
const allTalks = parseOrThrow(z.array(talkSchema), rawTalks, 'talks.json');
const allEducation = parseOrThrow(z.array(educationSchema), rawEducation, 'education.json');
const allBadges = parseOrThrow(z.array(badgeSchema), rawBadges, 'badges.json');

/** `present` sorts above every real month so the current role always leads. */
function monthKey(value: string): string {
  return value === 'present' ? '9999-99' : value;
}

export const roles: Role[] = [...allRoles].sort((a, b) => monthKey(b.start).localeCompare(monthKey(a.start)));
export const projects: Project[] = [...allProjects].sort((a, b) => b.year - a.year);
export const articles: Article[] = [...allArticles].sort((a, b) => b.date.localeCompare(a.date));
export const talks: Talk[] = [...allTalks].sort((a, b) => b.date.localeCompare(a.date));
export const education: Education[] = [...allEducation].sort((a, b) => b.end.localeCompare(a.end));
export const badges: Badge[] = [...allBadges].sort((a, b) => b.issued.localeCompare(a.issued) || a.name.localeCompare(b.name));

export const currentRole: Role | undefined = roles.find((role) => role.current);

/**
 * Splits talks around a reference date. The date is injected rather than read
 * from the clock so the split is testable and so the build output is
 * deterministic for a given build day.
 */
export function splitTalks(list: Talk[] = talks, now: Date = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const isUpcoming = (talk: Talk) => (talk.endDate ?? talk.date) >= today;
  return {
    upcoming: list.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date)),
    past: list.filter((talk) => !isUpcoming(talk)),
  };
}

export function featuredArticles(limit = 3, list: Article[] = articles): Article[] {
  const featured = list.filter((article) => article.featured);
  const rest = list.filter((article) => !article.featured);
  return [...featured, ...rest].slice(0, limit);
}

/** Distinct industries present in the data, for the projects filter. */
export function industryOptions(list: Project[] = projects) {
  const seen = new Map<string, Project['industry']>();
  for (const project of list) {
    if (!seen.has(project.industryKey)) seen.set(project.industryKey, project.industry);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

export function yearOptions(list: Project[] = projects): number[] {
  return [...new Set(list.map((project) => project.year))].sort((a, b) => b - a);
}

export function articleSources(list: Article[] = articles): Article['source'][] {
  return [...new Set(list.map((article) => article.source))].sort();
}

/**
 * Headline numbers for the home page. Everything is derived, so adding a row to
 * a JSON file updates the counters with no other edit.
 */
export function computeStats(now: Date = new Date()) {
  const countries = new Set(projects.map((project) => project.countryCode));
  const customers = new Set(projects.map((project) => project.customer));
  const earliestStart = allRoles
    .map((role) => role.start)
    .filter((start) => start !== 'present')
    .sort()[0];
  const startYear = earliestStart ? Number(earliestStart.slice(0, 4)) : now.getUTCFullYear();
  return {
    countries: countries.size,
    customers: customers.size,
    projects: projects.length,
    talks: talks.length,
    articles: articles.length,
    years: Math.max(0, now.getUTCFullYear() - startYear),
  };
}

export const stats = computeStats();

/**
 * Highlights with unfilled placeholders stripped out. A `TODO —` line is a note
 * to the author, not content: without this guard an unfinished role would
 * publish its reminder text to the live site.
 */
export function publishedHighlights(role: Role, lang: Lang): string[] {
  return role.highlights[lang].filter((highlight) => !highlight.trimStart().startsWith('TODO'));
}

/** Every unique skill across roles, used by the résumé page. */
export function allSkills(list: Role[] = roles): string[] {
  return [...new Set(list.flatMap((role) => role.skills))].sort();
}
