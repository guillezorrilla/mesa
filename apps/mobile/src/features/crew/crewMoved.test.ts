import type { PhoneCrew, PhoneDetail, PhoneRow } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { crewMoved } from './crewMoved';

const crew: PhoneCrew = {
  workers: [{ id: 'w1', title: 'Docs', state: 'working', branch: null }],
  tasks: [],
};
const row = (id: string, state: string): PhoneRow => ({
  id,
  title: 'Docs',
  project: null,
  state,
  since: 't1',
  context: null,
  unread: false,
});
const pushed = (id: string) => ({
  rows: [],
  watched: [{ id, detail: { row: row(id, 'idle') } as PhoneDetail }],
});

test("a worker's new state or the coordinator's pushed detail moves the crew", () => {
  expect(crewMoved('c1', crew, { rows: [row('w1', 'idle')] })).toBe(true);
  expect(crewMoved('c1', crew, pushed('c1'))).toBe(true);
});

test("a worker's same state, another session, or no crew does not", () => {
  expect(crewMoved('c1', crew, { rows: [row('w1', 'working')] })).toBe(false);
  expect(crewMoved('c1', crew, { rows: [row('other', 'idle')] })).toBe(false);
  expect(crewMoved('c1', crew, pushed('other'))).toBe(false);
  expect(crewMoved('c1', undefined, pushed('c1'))).toBe(false);
  expect(crewMoved('c1', { workers: [], tasks: [] }, pushed('c1'))).toBe(false);
});
