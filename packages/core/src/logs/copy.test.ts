import { expect, test } from 'vitest';
import { copyText, groupSummaryText } from './copy.js';
import { errorGroups } from './groups.js';
import type { ServerLogEntry } from './parse.js';

const STACK = [
  'java.lang.NullPointerException: berth is null',
  '\tat org.springframework.web.Servlet.run(Servlet.java:1)',
  '\tat com.example.MooringService.reserve(MooringService.java:88)',
].join('\n');
const boom: ServerLogEntry = {
  time: '2026-05-06T07:08:09.123-07:00',
  level: 'error',
  message: 'POST /moorings 500 reqId=7f3a',
  logger: 'c.e.h.MooringController',
  stack: STACK,
};
const context = { source: 'Docker · harbour-api' };

test('the default copy is ready to paste: time with date and zone, level, source, message, the full stack, request and fields', () => {
  expect(copyText([boom], 'paste', { ...context, fields: () => ({ pod: 'tide-api-7c9' }) })).toBe(
    [
      '```',
      'ERROR 2026-05-06T07:08:09.123-07:00 · Docker · harbour-api',
      'POST /moorings 500 reqId=7f3a',
      STACK,
      'request: 7f3a',
      'logger: c.e.h.MooringController',
      'pod: tide-api-7c9',
      '```',
    ].join('\n'),
  );
  // A time with no zone is written in UTC; an entry with no time says so.
  const plain = copyText(
    [
      { ...boom, time: null, stack: null, logger: null, message: 'boom' },
      {
        ...boom,
        time: '2026-05-06T07:08:09Z',
        level: null,
        stack: null,
        logger: null,
        message: 'calm',
      },
    ],
    'paste',
    context,
  );
  expect(plain).toBe(
    [
      '```',
      'ERROR no time · Docker · harbour-api',
      'boom',
      '',
      'LOG 2026-05-06T07:08:09Z · Docker · harbour-api',
      'calm',
      '```',
    ].join('\n'),
  );
});

test('the menu copies the message only, the raw entry as JSON, or Markdown', () => {
  expect(copyText([boom, { ...boom, message: 'again' }], 'message', context)).toBe(
    'POST /moorings 500 reqId=7f3a\nagain',
  );
  expect(
    JSON.parse(copyText([{ ...boom, key: 'k#0' } as ServerLogEntry], 'json', context)),
  ).toEqual(boom);
  expect(copyText([boom], 'markdown', context)).toBe(
    [
      '**ERROR 2026-05-06T07:08:09.123-07:00 · Docker · harbour-api**',
      '',
      'POST /moorings 500 reqId=7f3a',
      '',
      '```',
      STACK,
      '```',
      '',
      '- request: 7f3a',
      '- logger: c.e.h.MooringController',
    ].join('\n'),
  );
});

test('a group copies as a summary with one full sample', () => {
  const [group] = errorGroups([
    boom,
    { ...boom, time: '2026-05-06T07:09:00.000-07:00', message: 'POST /moorings 500 reqId=a204' },
  ]);
  if (!group) throw new Error('no group');
  const text = groupSummaryText(group, { ...context, services: ['harbour-api', 'tide-worker'] });
  expect(text.split('\n').slice(0, 6)).toEqual([
    'NullPointerException at MooringService.java:88 (x2)',
    'First seen: 2026-05-06T07:08:09.123-07:00',
    'Last seen: 2026-05-06T07:09:00.000-07:00',
    'Services: harbour-api, tide-worker',
    '',
    'Newest:',
  ]);
  expect(text).toContain('POST /moorings 500 reqId=a204');
  expect(text).toContain('MooringService.java:88');
});
