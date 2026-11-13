import { expect, test } from 'vitest';
import { dayBarLabel, dayDate, dayInitial } from './usageText';

test("a day reads as its weekday's initial under its bar and as a short date over the readout", () => {
  expect(dayInitial('2026-11-12')).toBe('T');
  expect(dayInitial('2026-11-15')).toBe('S');
  expect(dayDate('2026-11-12', 'en-US')).toBe('Thu, Nov 12');
  // The day before a DST change reads as itself, whatever the zone (Hermes used today's offset).
  expect(dayDate('2026-10-31', 'en-US')).toBe('Sat, Oct 31');
});

test("VoiceOver reads a bar's whole date, its cost, and the sessions a partial cost leaves out", () => {
  expect(dayBarLabel({ day: '2026-11-12', cost: 3.2, excluded: 0 }, 'en-US')).toBe(
    'Thursday, November 12, $3.20',
  );
  expect(dayBarLabel({ day: '2026-11-13', cost: null, excluded: 2 }, 'en-US')).toBe(
    'Friday, November 13, Unknown, excludes 2 sessions',
  );
});
