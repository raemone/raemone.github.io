import { z } from 'astro/zod';

/**
 * Every user-facing string is bilingual. Authors may write either a full
 * `{ en, fr }` object or a bare string when the text is identical in both
 * languages (company names, product names, acronyms). The bare form is
 * normalised into the object form so consumers only ever see one shape.
 */
export const i18nString = z
  .union([z.string(), z.object({ en: z.string(), fr: z.string() })])
  .transform((value) => (typeof value === 'string' ? { en: value, fr: value } : value));

export const i18nStringArray = z
  .union([z.array(z.string()), z.object({ en: z.array(z.string()), fr: z.array(z.string()) })])
  .transform((value) => (Array.isArray(value) ? { en: value, fr: value } : value));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date formatted as YYYY-MM-DD');

/** `YYYY-MM` for role start/end dates, or the literal `present` for a current role. */
const monthOrPresent = z
  .string()
  .regex(/^(\d{4}-\d{2}|present)$/, 'Expected YYYY-MM or the literal "present"');

const url = z.string().url();

export const profileSchema = z.object({
  name: z.string().min(1),
  initials: z.string().min(1).max(3),
  headline: i18nString,
  tagline: i18nString,
  currentCompany: z.string().min(1),
  currentRole: i18nString,
  basedIn: i18nString,
  originFrom: i18nString,
  timezone: z.string().min(1),
  bio: i18nStringArray,
  /**
   * Professional character, as distinct from what he does outside work: a short
   * label plus the sentence that gives it substance.
   */
  traits: z
    .array(z.object({ label: i18nString, detail: i18nString }))
    .default([]),
  /**
   * Volunteer and advisory work alongside the day job. `organisation` is a
   * proper noun in most cases, but stays bilingual so an unnamed one (an NDA'd
   * client, say) can be described in each language.
   */
  community: z
    .array(
      z.object({
        role: i18nString,
        organisation: i18nString,
        url: url.optional(),
        detail: i18nString,
        /** For a seat that carries a defined remit rather than a single duty. */
        responsibilities: i18nStringArray.optional(),
      }),
    )
    .default([]),
  /** An off-the-clock item, optionally linking out to whatever it refers to. */
  funFacts: z
    .array(z.object({ text: i18nString, url: url.optional() }))
    .default([]),
  photo: z.string().min(1),
  photoAlt: i18nString,
  gallery: z
    .array(z.object({ src: z.string().min(1), caption: i18nString }))
    .default([]),
  languages: z.array(z.object({ name: i18nString, level: i18nString })).default([]),
});

export const availabilitySchema = z.object({
  openToWork: z.boolean(),
  openToSpeaking: z.boolean(),
  openToAdvising: z.boolean(),
  openToBoard: z.boolean(),
  statusNote: i18nString,
  /** Optional context under the openness list, e.g. prior advisory work under NDA. */
  advisoryNote: i18nString.optional(),
  responseTime: i18nString,
});

export const contactSchema = z.object({
  /**
   * Contact happens through these profile links only. There is deliberately no
   * email field: publishing a personal address on a static page invites
   * scraping, and it cannot be unpublished once indexed.
   */
  links: z.array(
    z.object({
      label: z.string().min(1),
      url,
      handle: z.string().min(1),
      icon: z.enum(['linkedin', 'github', 'bluesky', 'mastodon', 'youtube', 'rss']),
    }),
  ),
  availability: availabilitySchema,
});

export const roleSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  title: i18nString,
  location: i18nString,
  start: monthOrPresent,
  end: monthOrPresent,
  current: z.boolean().default(false),
  summary: i18nString,
  highlights: i18nStringArray,
  skills: z.array(z.string()).default([]),
  logo: z.string().optional(),
});

export const educationSchema = z.object({
  id: z.string().min(1),
  institution: z.string().min(1),
  qualification: i18nString,
  location: i18nString,
  /** Year only — a CV rarely records the month, and the month adds nothing here. */
  start: z.string().regex(/^\d{4}$/, 'Expected a four-digit year'),
  end: z.string().regex(/^\d{4}$/, 'Expected a four-digit year'),
  note: i18nString.optional(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  /** Set when the customer name is under NDA and a generic label should show instead. */
  customerPublic: z.boolean().default(true),
  project: i18nString,
  description: i18nString,
  country: z.string().min(1),
  countryCode: z.string().length(2).toUpperCase(),
  city: z.string().min(1),
  /** WGS84 degrees. Latitude is clamped to the range the world projection can render. */
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180),
  year: z.number().int().min(1990).max(2100),
  industry: i18nString,
  /** Stable key used for filtering; keep it lowercase and hyphenated. */
  industryKey: z.string().regex(/^[a-z0-9-]+$/),
  tech: z.array(z.string()).default([]),
  outcome: i18nString.optional(),
});

export const articleSchema = z.object({
  id: z.string().min(1),
  title: i18nString,
  url,
  source: z.enum([
    'The Custom Engine',
    'LinkedIn',
    'Microsoft Tech Community',
    'Microsoft Learn',
    'DevBlogs',
    'Medium',
    'Other',
  ]),
  date: isoDate,
  excerpt: i18nString,
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  /** True when the entry was written by the RSS sync workflow rather than by hand. */
  auto: z.boolean().default(false),
});

export const talkSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  title: i18nString,
  abstract: i18nString,
  date: isoDate,
  endDate: isoDate.optional(),
  city: z.string().min(1),
  country: z.string().min(1),
  format: z.enum(['keynote', 'session', 'workshop', 'panel', 'podcast', 'webinar']),
  url: url.optional(),
  slidesUrl: url.optional(),
  recordingUrl: url.optional(),
});

/**
 * A Credly badge. Synced by scripts/sync-badges.mjs, which also stores the
 * image locally — `image` is a repository path, not a Credly URL, so the page
 * makes no third-party request.
 */
export const badgeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  issuer: z.string().min(1),
  issued: isoDate,
  url,
  image: z.string().min(1),
});

/** What a sample is for. One per sample, so it reads as a single label. */
export const CODE_CATEGORIES = ['automation', 'productivity', 'compliance', 'authoring', 'hack'] as const;

/** Agent hosts a sample runs on. A skill often targets several, so this is a list. */
export const CODE_PLATFORMS = ['copilot-studio', 'cowork', 'scout'] as const;

export const codeSampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: i18nString,
  category: z.enum(CODE_CATEGORIES),
  /** Empty for samples that are not built on an agent platform at all. */
  platforms: z.array(z.enum(CODE_PLATFORMS)).default([]),
  /** Where the sample is best seen: docs, a live build, or the source itself. */
  url,
  /** Only when `url` points somewhere other than the code. */
  sourceUrl: url.optional(),
});

export const profileArraySchemas = {
  roles: z.array(roleSchema),
  projects: z.array(projectSchema),
  articles: z.array(articleSchema),
  talks: z.array(talkSchema),
};

export type Profile = z.infer<typeof profileSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type Role = z.infer<typeof roleSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Talk = z.infer<typeof talkSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Badge = z.infer<typeof badgeSchema>;
export type CodeSample = z.infer<typeof codeSampleSchema>;
export type CodeCategory = (typeof CODE_CATEGORIES)[number];
export type CodePlatform = (typeof CODE_PLATFORMS)[number];
export type I18nString = { en: string; fr: string };
