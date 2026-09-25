import { expect, test } from 'vitest';
import { localDay, NoteTimeSchema, obsidianDateTime } from './time.js';

// Tests run with TZ=UTC (vitest.config.ts), so local time here is UTC.
test('Obsidian Date & Time: local YYYY-MM-DDTHH:mm, no seconds, no zone', () => {
  const date = new Date('2026-09-24T07:05:09.123Z');
  expect(obsidianDateTime(date)).toBe('2026-09-24T07:05');
  expect(localDay(date)).toBe('2026-09-24');
});

test('frontmatter times are read in the new form and the older ISO UTC form', () => {
  expect(NoteTimeSchema.safeParse('2026-09-24T07:05').success).toBe(true);
  expect(NoteTimeSchema.safeParse('2026-09-24T07:05:09').success).toBe(true);
  expect(NoteTimeSchema.safeParse('2026-09-24T07:05:09.123Z').success).toBe(true);
  expect(NoteTimeSchema.safeParse('2026-09-24 07:05').success).toBe(false);
  // A zone-less time parses as local, so file names in UTC still come out right.
  expect(new Date('2026-09-24T07:05:09').toISOString()).toBe('2026-09-24T07:05:09.000Z');
});

test('the time is local, not UTC', () => {
  const pinned = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    expect(obsidianDateTime(new Date('2026-09-24T12:00:00.000Z'))).toBe('2026-09-24T05:00');
    expect(localDay(new Date('2026-09-24T03:00:00.000Z'))).toBe('2026-09-23');
  } finally {
    process.env.TZ = pinned;
  }
});
