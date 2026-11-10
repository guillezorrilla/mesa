import { expect, test } from 'vitest';
import { sessionRow } from '../testing/index.js';
import { awakeStatus, wantsAwake } from './awake.js';

const row = (state: string, managed = true) => sessionRow({ managed, lastState: { state } });
const idle = [row('idle'), row('done')];
const busy = [row('idle'), row('working')];
// A foreign agent working is not a Mesa session working.
const foreign = [sessionRow({ managed: false, state: 'working' })];

test('on is always true, off never, and working only while a Mesa session works', () => {
  for (const rows of [[], idle, busy, foreign]) {
    expect(wantsAwake('on', rows)).toBe(true);
    expect(wantsAwake('off', rows)).toBe(false);
  }
  expect(wantsAwake('working', [])).toBe(false);
  expect(wantsAwake('working', idle)).toBe(false);
  expect(wantsAwake('working', foreign)).toBe(false);
  expect(wantsAwake('working', busy)).toBe(true);
});

test('the status counts the working sessions whatever the mode', () => {
  expect(awakeStatus('off', [...busy, row('working')])).toEqual({
    mode: 'off',
    wanted: false,
    working: 2,
  });
  expect(awakeStatus('working', busy)).toEqual({ mode: 'working', wanted: true, working: 1 });
});
