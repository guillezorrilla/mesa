import { expect, test } from 'vitest';
import { errorGroups, isMuted, muteKey, normalizedMessage } from './groups.js';
import type { ServerLogEntry } from './parse.js';

const entry = (message: string, time: string, stack: string | null = null): ServerLogEntry => ({
  time,
  level: 'error',
  message,
  logger: null,
  stack,
});
const NPE =
  'java.lang.NullPointerException: berth is null\n\tat com.example.MooringService.reserve(MooringService.java:88)';

test('errors group by exception and own frame, else by normalized message, newest group last', () => {
  const groups = errorGroups([
    entry('POST /moorings 500 reqId=7f3a', '10:42:03', NPE),
    entry('timeout after 3000 ms on berth 12', '10:42:05'),
    { ...entry('GET /tides 200', '10:42:06'), level: 'info' },
    entry('POST /moorings 500 reqId=a204', '10:42:12', NPE),
  ]);
  expect(groups.map(({ title, count, last }) => ({ title, count, last }))).toEqual([
    { title: 'timeout after # ms on berth #', count: 1, last: '10:42:05' },
    { title: 'NullPointerException at MooringService.java:88', count: 2, last: '10:42:12' },
  ]);
  expect(groups[1]?.entries.map((each) => each.message)).toEqual([
    'POST /moorings 500 reqId=7f3a',
    'POST /moorings 500 reqId=a204',
  ]);
});

test("a mute takes a line's path, else its normalized message, and hides the lines it matches", () => {
  expect(normalizedMessage('order 1189 took 42ms id=7f3a9c')).toBe('order # took #ms id=#');
  expect(muteKey('GET /actuator/health 200 2ms')).toBe('/actuator/health');
  expect(muteKey('cache warm in 12ms')).toBe('cache warm in #ms');
  const health = { ...entry('GET /actuator/health 200 3ms', 'x'), level: 'info' as const };
  expect(isMuted(health, ['/actuator/health'])).toBe(true);
  expect(
    isMuted({ ...entry('cache warm in 40ms', 'x'), level: 'info' }, ['cache warm in #ms']),
  ).toBe(true);
  expect(isMuted(entry('GET /tides 200', 'x'), ['/actuator/health'])).toBe(false);
  expect(isMuted(health, [])).toBe(false);
  // A mute is for noise: the path's failures still show.
  expect(isMuted(entry('GET /actuator/health 503 2ms', 'x'), ['/actuator/health'])).toBe(false);
});
