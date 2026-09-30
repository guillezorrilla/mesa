import { z } from 'zod';

// Local time comes from the process time zone (TZ), the one dependency here that is not injected:
// it is the wall clock Obsidian shows, so it is accepted as is. Tests pin TZ=UTC (vitest.config.ts).

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The local calendar date of `date` as YYYY-MM-DD: the daily note's name, and Obsidian's Date. */
export const localDay = (date: Date) =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * `date` in local time as YYYY-MM-DDTHH:mm, the form Obsidian infers as a Date & Time property:
 * with seconds it infers text (checked on 1.13.7, docs/spikes/obsidian-cli.md). No zone: Obsidian
 * reads it as local. Minute precision is enough here; receipt file names and ids keep the rest.
 */
export const obsidianDateTime = (date: Date) =>
  `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Written as YYYY-MM-DDTHH:mm; a seconds part is accepted too.
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** A frontmatter time as Mesa writes it now, or as older notes hold it (ISO UTC). */
export const NoteTimeSchema = z.union([
  z.string().regex(LOCAL_DATE_TIME, 'must be YYYY-MM-DDTHH:mm'),
  z.iso.datetime(),
]);

/** A real local calendar day; date-only strings must never be parsed as UTC. */
export function validLocalDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return localDay(date) === value;
}
