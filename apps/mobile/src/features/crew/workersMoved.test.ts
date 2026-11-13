import type { PhoneCrew, PhoneRow } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { workersMoved } from './workersMoved';

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

test("a worker's new state moves the crew; its own state, another session or no crew does not", () => {
  expect(workersMoved(crew, [row('w1', 'idle')])).toBe(true);
  expect(workersMoved(crew, [row('w1', 'working')])).toBe(false);
  expect(workersMoved(crew, [row('other', 'idle')])).toBe(false);
  expect(workersMoved(undefined, [row('w1', 'idle')])).toBe(false);
});
