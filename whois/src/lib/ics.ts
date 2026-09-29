import { DEFAULT_LANG } from '@/i18n/ui';
import type { Talk } from './schema';

/** Folds a line to the 75-octet limit the iCalendar spec requires. */
export function fold(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    chunks.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
}

export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toCalendarDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** DTEND is exclusive for all-day events, so it lands on the day after the last one. */
export function dayAfter(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return toCalendarDate(date.toISOString().slice(0, 10));
}

/**
 * Renders a talk as a single all-day VEVENT. The timestamp is injected so the
 * output is deterministic in tests.
 */
export function buildIcs(talk: Talk, now: Date = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//raemone.github.io//whois//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${talk.id}@raemone.github.io`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${toCalendarDate(talk.date)}`,
    `DTEND;VALUE=DATE:${dayAfter(talk.endDate ?? talk.date)}`,
    fold(`SUMMARY:${escapeText(`${talk.title[DEFAULT_LANG]} — ${talk.event}`)}`),
    fold(`DESCRIPTION:${escapeText(talk.abstract[DEFAULT_LANG])}`),
    fold(`LOCATION:${escapeText(`${talk.city}, ${talk.country}`)}`),
    ...(talk.url ? [fold(`URL:${talk.url}`)] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
