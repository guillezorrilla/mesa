import { expect, test } from 'vitest';
import { branchOf, ticketBranch } from './ticket-start.js';

test("a ticket's branch is its key, then its title's words, cut at a word within 50 characters", () => {
  expect(ticketBranch('LC-12', 'Tide alarm rings twice')).toBe('lc-12-tide-alarm-rings-twice');
  expect(ticketBranch('owner/repo/12', 'Fix: the reef map (again)')).toBe(
    'issue-12-fix-the-reef-map-again',
  );
  const long = ticketBranch(
    'CRV-31926',
    'Publisher batch document export drops the harbour schedule attachments',
  );
  expect(long).toBe('crv-31926-publisher-batch-document-export-drops');
  expect(long.length).toBeLessThanOrEqual(50);
  // A title with no words, or one long word, keeps the key whole.
  expect(ticketBranch('LC-12', '  !!  ')).toBe('lc-12');
  expect(ticketBranch('LC-12', 'x'.repeat(80))).toBe('lc-12');
  // The key part is still branchOf's, which a session's name and the prompts match by.
  expect(ticketBranch('LC-12', 'Tide').startsWith(`${branchOf('LC-12')}-`)).toBe(true);
});
