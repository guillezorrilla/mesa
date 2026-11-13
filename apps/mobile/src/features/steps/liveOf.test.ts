import type { PhoneDetail, PhoneStep } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { liveOf } from './liveOf';

const run: PhoneStep = {
  type: 'tool',
  id: 'tu-2',
  newer: 0,
  kind: 'command',
  name: 'Bash',
  target: 'pnpm test',
  status: 'running',
};
const read: PhoneStep = { ...run, id: 'tu-1', kind: 'read', target: 'tide.ts', status: 'done' };
const detail = (
  state: string,
  current?: string,
): Pick<PhoneDetail, 'row' | 'steps' | 'current'> => ({
  row: {
    id: 's',
    title: 'Tides',
    project: 'tide-tables',
    state,
    since: '',
    context: null,
    unread: false,
  },
  steps: [run, read],
  current,
});

test('a working session shows the step the Mac names, Working without one, nothing once it stops', () => {
  expect(liveOf(detail('working', 'tu-2'))).toEqual({ step: run });
  // An older Mac names none, and a step the detail no longer holds is not guessed at.
  expect(liveOf(detail('working'))).toEqual({ step: undefined });
  expect(liveOf(detail('working', 'gone'))).toEqual({ step: undefined });
  expect(liveOf(detail('idle', 'tu-2'))).toBeUndefined();
  expect(liveOf(detail('waiting-question', 'tu-2'))).toBeUndefined();
  expect(liveOf(detail('done', 'tu-2'))).toBeUndefined();
});
