import { describe, expect, it } from 'vitest';
import {
  articleSchema,
  badgeSchema,
  codeSampleSchema,
  educationSchema,
  i18nString,
  i18nStringArray,
  profileSchema,
  projectSchema,
  roleSchema,
  talkSchema,
} from '@/lib/schema';

describe('i18nString', () => {
  it('normalises a bare string into both languages', () => {
    expect(i18nString.parse('Microsoft')).toEqual({ en: 'Microsoft', fr: 'Microsoft' });
  });

  it('passes an explicit pair through unchanged', () => {
    expect(i18nString.parse({ en: 'About', fr: 'À propos' })).toEqual({ en: 'About', fr: 'À propos' });
  });

  it('rejects a pair that is missing a language', () => {
    expect(() => i18nString.parse({ en: 'About' })).toThrow();
  });
});

describe('i18nStringArray', () => {
  it('normalises a bare array into both languages', () => {
    expect(i18nStringArray.parse(['a', 'b'])).toEqual({ en: ['a', 'b'], fr: ['a', 'b'] });
  });

  it('passes an explicit pair through unchanged', () => {
    expect(i18nStringArray.parse({ en: ['a'], fr: ['b'] })).toEqual({ en: ['a'], fr: ['b'] });
  });
});

const validProject = {
  id: 'p1',
  customer: 'Contoso',
  project: 'Agent rollout',
  description: 'A description.',
  country: 'France',
  countryCode: 'fr',
  city: 'Paris',
  lat: 48.85,
  lng: 2.35,
  year: 2025,
  industry: 'Retail',
  industryKey: 'retail',
};

describe('projectSchema', () => {
  it('accepts a minimal project and applies defaults', () => {
    const parsed = projectSchema.parse(validProject);
    expect(parsed.customerPublic).toBe(true);
    expect(parsed.tech).toEqual([]);
    expect(parsed.countryCode).toBe('FR');
    expect(parsed.project).toEqual({ en: 'Agent rollout', fr: 'Agent rollout' });
  });

  it('rejects a latitude the world projection cannot render', () => {
    expect(() => projectSchema.parse({ ...validProject, lat: 91 })).toThrow();
  });

  it('rejects an out-of-range longitude', () => {
    expect(() => projectSchema.parse({ ...validProject, lng: 181 })).toThrow();
  });

  it('rejects a country code that is not two letters', () => {
    expect(() => projectSchema.parse({ ...validProject, countryCode: 'FRA' })).toThrow();
  });

  it('rejects an industry key that would break filtering', () => {
    expect(() => projectSchema.parse({ ...validProject, industryKey: 'Financial Services' })).toThrow();
  });
});

describe('roleSchema', () => {
  const validRole = {
    id: 'r1',
    company: 'Microsoft',
    title: 'Architect',
    location: 'Paris',
    start: '2024-01',
    end: 'present',
    current: true,
    summary: 'Summary.',
    highlights: ['One'],
  };

  it('accepts YYYY-MM and the literal present', () => {
    expect(roleSchema.parse(validRole).end).toBe('present');
  });

  it('rejects a full ISO date where a month is expected', () => {
    expect(() => roleSchema.parse({ ...validRole, start: '2024-01-15' })).toThrow();
  });

  it('defaults current to false', () => {
    const { current, ...withoutCurrent } = validRole;
    expect(roleSchema.parse(withoutCurrent).current).toBe(false);
  });
});

describe('articleSchema', () => {
  const validArticle = {
    id: 'a1',
    title: 'Title',
    url: 'https://example.com/post',
    source: 'LinkedIn',
    date: '2025-06-12',
    excerpt: 'Excerpt.',
  };

  it('accepts a known source and applies defaults', () => {
    const parsed = articleSchema.parse(validArticle);
    expect(parsed.featured).toBe(false);
    expect(parsed.auto).toBe(false);
    expect(parsed.tags).toEqual([]);
  });

  it('accepts The Custom Engine, the Copilot Studio CAT blog', () => {
    expect(articleSchema.parse({ ...validArticle, source: 'The Custom Engine' }).source).toBe(
      'The Custom Engine',
    );
  });

  it('rejects an unknown source rather than rendering a blank label', () => {
    expect(() => articleSchema.parse({ ...validArticle, source: 'Substack' })).toThrow();
  });

  it('rejects a malformed date', () => {
    expect(() => articleSchema.parse({ ...validArticle, date: '12/06/2025' })).toThrow();
  });

  it('rejects a relative URL, which would break the external link', () => {
    expect(() => articleSchema.parse({ ...validArticle, url: '/post' })).toThrow();
  });
});

describe('talkSchema', () => {
  const validTalk = {
    id: 't1',
    event: 'Conference',
    title: 'Title',
    abstract: 'Abstract.',
    date: '2026-11-17',
    city: 'Amsterdam',
    country: 'Netherlands',
    format: 'session',
  };

  it('accepts a talk without an end date', () => {
    expect(talkSchema.parse(validTalk).endDate).toBeUndefined();
  });

  it('rejects an unknown format', () => {
    expect(() => talkSchema.parse({ ...validTalk, format: 'fireside' })).toThrow();
  });
});

describe('codeSampleSchema', () => {
  const valid = {
    id: 'eu-greenwashing-analysis',
    name: 'EU Greenwashing Analysis',
    summary: 'Detect unsupported environmental claims.',
    category: 'compliance',
    platforms: ['copilot-studio', 'cowork', 'scout'],
    url: 'https://microsoft.github.io/cat-agent-skills/skills/eu-greenwashing-analysis/',
  };

  it('keeps every platform a skill targets', () => {
    const parsed = codeSampleSchema.parse(valid);
    expect(parsed.platforms).toEqual(['copilot-studio', 'cowork', 'scout']);
    expect(parsed.summary).toEqual({
      en: 'Detect unsupported environmental claims.',
      fr: 'Detect unsupported environmental claims.',
    });
  });

  it('accepts a sample that belongs to no platform', () => {
    // The games are not built on an agent platform, so an empty list is valid
    // rather than a reason to reject the entry.
    expect(codeSampleSchema.parse({ ...valid, platforms: [] }).platforms).toEqual([]);
    const { platforms, ...withoutPlatforms } = valid;
    expect(codeSampleSchema.parse(withoutPlatforms).platforms).toEqual([]);
  });

  it('rejects a category outside the list', () => {
    expect(() => codeSampleSchema.parse({ ...valid, category: 'misc' })).toThrow();
  });

  it('rejects an unknown platform', () => {
    expect(() => codeSampleSchema.parse({ ...valid, platforms: ['teams'] })).toThrow();
  });

  it('requires a single category, not several', () => {
    expect(() => codeSampleSchema.parse({ ...valid, category: ['compliance', 'hack'] })).toThrow();
  });

  it('leaves the source link optional and validates it when present', () => {
    expect(codeSampleSchema.parse(valid).sourceUrl).toBeUndefined();
    expect(() => codeSampleSchema.parse({ ...valid, sourceUrl: 'github.com/raemone/Games' })).toThrow();
  });
});

describe('badgeSchema', () => {
  const valid = {
    id: '9b5eaef4-319c-4446-832e-8a63194f4acd',
    name: 'Agent Hack Champion @ PPCC 2025',
    issuer: 'Power Platform Community Conference',
    issued: '2025-10-30',
    url: 'https://www.credly.com/badges/9b5eaef4-319c-4446-832e-8a63194f4acd/public_url',
    image: 'images/badges/9b5eaef4-319c-4446-832e-8a63194f4acd.png',
  };

  it('accepts a synced badge', () => {
    expect(badgeSchema.parse(valid).name).toBe('Agent Hack Champion @ PPCC 2025');
  });

  it('rejects a year-only issue date', () => {
    expect(() => badgeSchema.parse({ ...valid, issued: '2025' })).toThrow();
  });

  it('rejects a badge with no issuer', () => {
    expect(() => badgeSchema.parse({ ...valid, issuer: '' })).toThrow();
  });

  it('rejects a non-url verification link', () => {
    expect(() => badgeSchema.parse({ ...valid, url: 'credly.com/badges/abc' })).toThrow();
  });
});

describe('profileSchema traits', () => {
  /** Every required field, so each test varies only `traits`. */
  const base = {
    name: 'Rémi Dyon',
    initials: 'RD',
    headline: 'Principal Solution Architect',
    tagline: 'Tagline',
    currentCompany: 'Microsoft',
    currentRole: 'Principal Solution Architect',
    basedIn: 'Atlanta, Georgia',
    originFrom: 'France',
    timezone: 'America/New_York',
    bio: ['A paragraph.'],
    photo: 'images/portrait.jpg',
    photoAlt: 'Portrait',
  };

  it('normalises a bare string on both halves of a trait', () => {
    const parsed = profileSchema.parse({
      ...base,
      traits: [{ label: 'Systems thinker', detail: 'I connect the moving parts.' }],
    });
    expect(parsed.traits[0]).toEqual({
      label: { en: 'Systems thinker', fr: 'Systems thinker' },
      detail: { en: 'I connect the moving parts.', fr: 'I connect the moving parts.' },
    });
  });

  it('keeps a per-language label and detail distinct', () => {
    const parsed = profileSchema.parse({
      ...base,
      traits: [
        {
          label: { en: 'Trusted challenger', fr: 'Contradicteur de confiance' },
          detail: { en: 'I ask hard questions.', fr: 'Je pose les questions difficiles.' },
        },
      ],
    });
    expect(parsed.traits[0].label.fr).toBe('Contradicteur de confiance');
    expect(parsed.traits[0].detail.en).toBe('I ask hard questions.');
  });

  it('rejects a trait that carries a label but no detail', () => {
    expect(() => profileSchema.parse({ ...base, traits: [{ label: 'Pragmatic builder' }] })).toThrow();
  });

  it('defaults to no traits at all', () => {
    expect(profileSchema.parse(base).traits).toEqual([]);
  });

  it('normalises a community entry and leaves the link optional', () => {
    const parsed = profileSchema.parse({
      ...base,
      community: [
        {
          role: 'Mentor',
          organisation: 'Women in Power Platform',
          url: 'https://www.linkedin.com/company/women-in-power-platform/',
          detail: 'Mentoring women building careers on the Power Platform.',
        },
        {
          role: { en: 'Advisor', fr: 'Conseiller' },
          organisation: { en: 'Two French AI startups', fr: 'Deux startups françaises en IA' },
          detail: { en: 'Under NDA.', fr: 'Sous NDA.' },
        },
      ],
    });
    expect(parsed.community[0].organisation).toEqual({
      en: 'Women in Power Platform',
      fr: 'Women in Power Platform',
    });
    // An NDA'd entry carries no link, and must not be rejected for it.
    expect(parsed.community[1].url).toBeUndefined();
    expect(parsed.community[1].organisation.fr).toBe('Deux startups françaises en IA');
  });

  it('carries an optional remit, normalised across both languages', () => {
    const parsed = profileSchema.parse({
      ...base,
      community: [
        {
          role: 'Programming committee board',
          organisation: 'AI Summit North America 2027',
          detail: 'A seat on the board shaping the programme.',
          responsibilities: ['Set the direction of the agenda.', 'Select the programme.'],
        },
        { role: 'Mentor', organisation: 'X', detail: 'd' },
      ],
    });
    expect(parsed.community[0].responsibilities).toEqual({
      en: ['Set the direction of the agenda.', 'Select the programme.'],
      fr: ['Set the direction of the agenda.', 'Select the programme.'],
    });
    // Most seats carry a single duty line and no list at all.
    expect(parsed.community[1].responsibilities).toBeUndefined();
  });

  it('keeps a per-language remit distinct', () => {
    const parsed = profileSchema.parse({
      ...base,
      community: [
        {
          role: 'Programming committee board',
          organisation: 'AI Summit North America 2027',
          detail: { en: 'A seat on the board.', fr: 'Un siège au comité.' },
          responsibilities: { en: ['Select the programme.'], fr: ['Sélectionner le programme.'] },
        },
      ],
    });
    expect(parsed.community[0].responsibilities?.fr).toEqual(['Sélectionner le programme.']);
  });

  it('rejects a community entry whose link is not a url', () => {
    expect(() =>
      profileSchema.parse({
        ...base,
        community: [{ role: 'Mentor', organisation: 'X', url: 'linkedin.com/x', detail: 'd' }],
      }),
    ).toThrow();
  });

  it('defaults to no community entries', () => {
    expect(profileSchema.parse(base).community).toEqual([]);
  });
});

describe('educationSchema', () => {
  const validEntry = {
    id: 'e1',
    institution: 'Oxford Brookes University',
    qualification: 'BSc Computing',
    location: 'Oxford, United Kingdom',
    start: '2004',
    end: '2005',
  };

  it('accepts a year-only entry and normalises bilingual fields', () => {
    const parsed = educationSchema.parse(validEntry);
    expect(parsed.qualification).toEqual({ en: 'BSc Computing', fr: 'BSc Computing' });
    expect(parsed.note).toBeUndefined();
  });

  it('rejects a full date where a year is expected', () => {
    expect(() => educationSchema.parse({ ...validEntry, start: '2004-09' })).toThrow();
  });

  it('rejects a two-digit year', () => {
    expect(() => educationSchema.parse({ ...validEntry, end: '05' })).toThrow();
  });

  it('accepts an optional note', () => {
    const parsed = educationSchema.parse({ ...validEntry, note: 'A year studying in English.' });
    expect(parsed.note?.en).toBe('A year studying in English.');
  });
});
