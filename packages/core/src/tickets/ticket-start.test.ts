import { expect, test } from 'vitest';
import { ticketBranch } from './ticket-start.js';

test("a ticket's branch is its key, then its title's words, cut at a word within 50 characters", () => {
  expect(ticketBranch('LC-12', 'Tide alarm rings twice')).toBe('lc-12-tide-alarm-rings-twice');
  expect(
    ticketBranch('HAR-219', 'Berth schedule export drops the tide table attachments on Sundays'),
  ).toBe('har-219-berth-schedule-export-drops-the-tide-table');
  // An imported title's leading key names it once, so the app's summary and `from.title` agree.
  expect(ticketBranch('LC-12', 'LC-12: Tide alarm rings twice')).toBe(
    'lc-12-tide-alarm-rings-twice',
  );
  expect(ticketBranch('owner/repo/12', 'owner/repo#12: Fix: the reef map')).toBe(
    'issue-12-fix-the-reef-map',
  );
  expect(ticketBranch('owner/repo#12', 'Fix: the reef map')).toBe('issue-12-fix-the-reef-map');
  // Accents fold to their letters.
  expect(ticketBranch('LC-12', 'Añadir exportación')).toBe('lc-12-anadir-exportacion');
  // A title with no words, or one long word, keeps the key whole.
  expect(ticketBranch('LC-12', '  !!  ')).toBe('lc-12');
  expect(ticketBranch('LC-12', 'x'.repeat(80))).toBe('lc-12');
});
