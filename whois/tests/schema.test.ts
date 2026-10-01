import { describe, expect, it } from 'vitest';
import {
  articleSchema,
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
