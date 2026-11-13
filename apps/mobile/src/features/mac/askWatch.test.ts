import { macCalls } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { askWatch } from './askWatch';

/** The phone's calls to a Mac that takes each watch, or, on an older release, answers nothing. */
const callsTo = (takesWatch: boolean) => {
  const calls = macCalls({
    send: (message) => {
      if (takesWatch && message.kind === 'request')
        queueMicrotask(() => calls.settle({ kind: 'response', id: message.id, result: {} }));
    },
    newId: () => 'q1',
    // An older Mac's request times out at once; a current one answers first.
    wait: () => (takesWatch ? new Promise(() => {}) : Promise.resolve()),
  });
  return calls;
};

test('a Mac that takes the watch pushes; one on an older release answers nothing, so the phone polls', async () => {
  expect(await askWatch(callsTo(true), 'ab12cd34', 10)).toBe(true);
  expect(await askWatch(callsTo(false), 'ab12cd34', 10)).toBe(false);
});
