import { expect, test } from 'vitest';
import {
  calendarLeaf,
  costText,
  draftReady,
  foundText,
  impactStats,
  kindWord,
  savedText,
} from './vaultText';

test('Impact today reads as three counts, a guardrail stop counting as caught', () => {
  expect(impactStats({ sentence: '', caught: 1, kept: 3, notesIn: 2, stopped: 1 })).toEqual([
    { label: 'Kept', value: 3 },
    { label: 'Notes in', value: 2 },
    { label: 'Caught', value: 2 },
  ]);
});

test('the cost says when it is unknown, and kinds read as words', () => {
  expect(costText(null)).toBe('Cost unknown');
  expect(costText(1.234)).toBe('$1.23 estimated at the last sync');
  expect(kindWord('vault-change')).toBe('Vault change');
  expect(kindWord('phone')).toBe('Phone');
});

test('a saved decision says whether it added anything; a draft needs every field', () => {
  expect(savedText({ path: 'p', changed: false, receipt: null })).toContain('already kept');
  expect(savedText({ path: 'p', changed: true, receipt: 'r' })).toContain('Kept');
  const draft = { project: 'cove', title: 'T', decision: 'D', rationale: 'R' };
  expect(draftReady(draft)).toBe(true);
  expect(draftReady({ ...draft, rationale: '  ' })).toBe(false);
});

test('a day reads as a calendar leaf', () => {
  expect(calendarLeaf(new Date(2026, 10, 12))).toEqual({
    month: 'NOV',
    day: '12',
    weekday: 'Thursday',
  });
});

test('a search says how many it found, and when it shows only the first of them', () => {
  expect(foundText(0, 0)).toBe('Nothing in the vault has every word.');
  expect(foundText(3, 3)).toBe('3 found');
  expect(foundText(40, 25)).toBe('The first 25 of 40');
});
