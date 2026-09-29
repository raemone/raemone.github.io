import { describe, expect, it } from 'vitest';
import { buildIcs, dayAfter, escapeText, fold } from '@/lib/ics';
import type { Talk } from '@/lib/schema';

const NOW = new Date('2026-09-29T10:00:00.000Z');

const talk: Talk = {
  id: 'talk-1',
  event: 'Conference',
  title: { en: 'Building agents', fr: 'Construire des agents' },
  abstract: { en: 'A talk about agents.', fr: 'Une conférence sur les agents.' },
  date: '2026-11-17',
  endDate: '2026-11-19',
  city: 'Amsterdam',
  country: 'Netherlands',
  format: 'session',
  url: 'https://example.com/event',
};

describe('escapeText', () => {
  it('escapes the characters iCalendar treats as structure', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
  });

  it('escapes newlines rather than breaking the line', () => {
    expect(escapeText('a\nb')).toBe('a\\nb');
  });
});

describe('fold', () => {
  it('leaves a short line alone', () => {
    expect(fold('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('wraps a long line with a leading space on continuations', () => {
    const folded = fold(`SUMMARY:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
    // No content is lost by folding.
    expect(lines.map((line, index) => (index === 0 ? line : line.slice(1))).join('')).toBe(
      `SUMMARY:${'x'.repeat(200)}`,
    );
  });
});

describe('dayAfter', () => {
  it('advances by one day', () => {
    expect(dayAfter('2026-11-19')).toBe('20261120');
  });

  it('rolls over a month boundary', () => {
    expect(dayAfter('2026-11-30')).toBe('20261201');
  });

  it('rolls over a leap day', () => {
    expect(dayAfter('2028-02-28')).toBe('20280229');
  });
});

describe('buildIcs', () => {
  const output = buildIcs(talk, NOW);

  it('produces a well-formed calendar', () => {
    expect(output.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(output.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(output).toContain('BEGIN:VEVENT');
    expect(output).toContain('END:VEVENT');
  });

  it('uses CRLF line endings as the spec requires', () => {
    const bareNewlines = output.split('\n').filter((line) => !line.endsWith('\r') && line !== '');
    expect(bareNewlines).toEqual([]);
  });

  it('makes DTEND exclusive, one day past the final day', () => {
    expect(output).toContain('DTSTART;VALUE=DATE:20261117');
    expect(output).toContain('DTEND;VALUE=DATE:20261120');
  });

  it('falls back to the start date for a single-day talk', () => {
    const { endDate, ...singleDay } = talk;
    const single = buildIcs(singleDay as Talk, NOW);
    expect(single).toContain('DTEND;VALUE=DATE:20261118');
  });

  it('omits the URL line when the talk has no event page', () => {
    const { url, ...withoutUrl } = talk;
    expect(buildIcs(withoutUrl as Talk, NOW)).not.toContain('URL:');
  });

  it('is deterministic for a given timestamp', () => {
    expect(buildIcs(talk, NOW)).toBe(output);
    expect(output).toContain('DTSTAMP:20260929T100000Z');
  });
});
