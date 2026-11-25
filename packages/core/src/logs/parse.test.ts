import { expect, test } from 'vitest';
import { atLeast, parseLog } from './parse.js';

test("Spring Boot's console line gives its time, level and text", () => {
  expect(
    parseLog([
      '2026-01-02T10:11:12.345-08:00 ERROR 123 --- [lantern] [nio-8080-exec-1] c.e.TideController       : tide table missing',
      '2026-01-02 10:11:13.001  WARN 123 --- [           main] o.s.b.Harbour : slow start',
    ]),
  ).toEqual([
    {
      time: '2026-01-02T10:11:12.345-08:00',
      level: 'error',
      message: 'tide table missing',
      stack: null,
    },
    { time: '2026-01-02 10:11:13.001', level: 'warn', message: 'slow start', stack: null },
  ]);
});

test('a JSON line gives severity or level, message or msg, and its time', () => {
  expect(
    parseLog([
      '{"severity":"WARNING","message":"buoy 7 drifting","timestamp":"2026-03-04T05:06:07Z"}',
      '{"level":50,"msg":"anchor lost","time":1772600000000}',
      '{"level":"info","msg":"harbour open","stack":"Error: none\\n    at open"}',
      '{"not":"a log line"}',
    ]),
  ).toEqual([
    { time: '2026-03-04T05:06:07Z', level: 'warn', message: 'buoy 7 drifting', stack: null },
    {
      time: new Date(1772600000000).toISOString(),
      level: 'error',
      message: 'anchor lost',
      stack: null,
    },
    { time: null, level: 'info', message: 'harbour open', stack: 'Error: none\n    at open' },
    { time: null, level: null, message: '{"not":"a log line"}', stack: null },
  ]);
});

test('any other line takes its level from an ERROR, WARN, INFO or DEBUG word, else none', () => {
  expect(
    parseLog([
      { text: 'ERROR boom', time: '2026-05-06T07:08:09.123456789Z' },
      '[2026-05-06T07:08:10Z] INFO ferry docked',
      'DEBUG cache warm',
      '  ready in 312 ms',
      '',
      'an error in lower case is no level',
    ]),
  ).toEqual([
    { time: '2026-05-06T07:08:09.123456789Z', level: 'error', message: 'ERROR boom', stack: null },
    {
      time: '2026-05-06T07:08:10Z',
      level: 'info',
      message: '[2026-05-06T07:08:10Z] INFO ferry docked',
      stack: null,
    },
    { time: null, level: 'debug', message: 'DEBUG cache warm', stack: null },
    { time: null, level: null, message: '  ready in 312 ms', stack: null },
    { time: null, level: null, message: 'an error in lower case is no level', stack: null },
  ]);
});

test('stack lines fold into the entry before them', () => {
  const entries = parseLog([
    '2026-01-02T10:11:12.345Z ERROR 1 --- [harbour] [main] c.e.Dock : could not moor',
    'com.example.dock.MooringException: rope too short',
    '\tat com.example.dock.Dock.moor(Dock.java:42)',
    '\tat com.example.dock.Harbour.arrive(Harbour.java:7)',
    'Caused by: java.lang.IllegalStateException: tide out',
    '\t... 12 more',
    'TypeError: cannot read the chart',
    '    at readChart (src/chart.ts:88:31)',
    'INFO next ship',
  ]);
  expect(entries.map((entry) => [entry.message, entry.stack])).toEqual([
    [
      'could not moor',
      [
        'com.example.dock.MooringException: rope too short',
        '\tat com.example.dock.Dock.moor(Dock.java:42)',
        '\tat com.example.dock.Harbour.arrive(Harbour.java:7)',
        'Caused by: java.lang.IllegalStateException: tide out',
        '\t... 12 more',
      ].join('\n'),
    ],
    ['TypeError: cannot read the chart', '    at readChart (src/chart.ts:88:31)'],
    ['INFO next ship', null],
  ]);
});

test('a level filter keeps that level and the more severe ones', () => {
  const [error, warn, info, none] = parseLog(['ERROR a', 'WARN b', 'INFO c', 'plain d']);
  const kept = (level: Parameters<typeof atLeast>[1]) =>
    [error, warn, info, none].filter((entry) => entry && atLeast(entry, level)).length;
  expect([kept('error'), kept('warn'), kept('info'), kept(undefined)]).toEqual([1, 2, 3, 4]);
});
