import { expect, test } from 'vitest';
import { familyOf, withParentsNow } from './family.js';

test('a child reports to the newest session its parent was resumed as, through a chain', () => {
  const records = [
    { id: 'lead1', resumedBy: 'lead2' },
    { id: 'kid', parent: 'lead1' },
    // Resumed again, linked only from the new side (writing resumedBy failed).
    { id: 'lead2', resumedFrom: 'lead1' },
    { id: 'lead3', resumedFrom: 'lead2' },
  ];
  const parentNow = familyOf(records);
  expect(parentNow(records[1] as never)).toBe('lead3');
  expect(parentNow(records[0] as never)).toBeUndefined();
  expect(withParentsNow(records)[1]).toEqual({ id: 'kid', parent: 'lead1', parentNow: 'lead3' });
});

test('a parent with no record stays as named; a loop of links gives none', () => {
  expect(familyOf([])({ id: 'kid', parent: 'gone' })).toBe('gone');
  const loop = [
    { id: 'a', resumedBy: 'b' },
    { id: 'b', resumedBy: 'a' },
    { id: 'kid', parent: 'a' },
  ];
  expect(['a', 'b']).toContain(familyOf(loop)(loop[2] as never));
  expect(familyOf([{ id: 'self', parent: 'self' }])({ id: 'self', parent: 'self' })).toBe(
    undefined,
  );
});

test("a handoff successor reports to its predecessor's parent, and the predecessor's children follow it", () => {
  const records = [
    { id: 'lead' },
    { id: 'w1', parent: 'lead' },
    // w1 handed off twice: each successor's parent is the session it came from.
    { id: 'w2', parent: 'w1', handoffFrom: 'w1' },
    { id: 'w3', parent: 'w2', handoffFrom: 'w2' },
    { id: 'helper', parent: 'w1' },
    // The lead handed off too: its workers report to its successor.
    { id: 'lead2', handoffFrom: 'lead' },
  ];
  const parentNow = familyOf(records);
  const of = (id: string) => parentNow(records.find((r) => r.id === id) as never);
  expect(of('w3')).toBe('lead2');
  expect(of('w2')).toBe('lead2');
  expect(of('helper')).toBe('w3');
  expect(of('lead2')).toBeUndefined();
});
