import { expect, test } from 'vitest';
import { atLeast, parseLog } from './parse.js';

test("Spring Boot's console line gives its time, level, logger and text", () => {
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
      logger: 'c.e.TideController',
      stack: null,
    },
    {
      time: '2026-01-02 10:11:13.001',
      level: 'warn',
      message: 'slow start',
      logger: 'o.s.b.Harbour',
      stack: null,
    },
  ]);
});

test('a JSON line gives severity or level, message or msg, and its time', () => {
  expect(
    parseLog([
      '{"severity":"WARNING","message":"buoy 7 drifting","timestamp":"2026-03-04T05:06:07Z"}',
      '{"level":50,"msg":"anchor lost","time":1772600000000,"logger":"harbour.dock"}',
      '{"level":"info","msg":"harbour open","stack":"Error: none\\n    at open"}',
      '{"not":"a log line"}',
    ]),
  ).toEqual([
    {
      time: '2026-03-04T05:06:07Z',
      level: 'warn',
      message: 'buoy 7 drifting',
      logger: null,
      stack: null,
    },
    {
      time: new Date(1772600000000).toISOString(),
      level: 'error',
      message: 'anchor lost',
      logger: 'harbour.dock',
      stack: null,
    },
    {
      time: null,
      level: 'info',
      message: 'harbour open',
      logger: null,
      stack: 'Error: none\n    at open',
    },
    { time: null, level: null, message: '{"not":"a log line"}', logger: null, stack: null },
  ]);
});

test('any other line takes its level from an ERROR, WARN, INFO or DEBUG word, else none', () => {
  expect(
    parseLog([
      { text: 'ERROR boom', time: '2026-05-06T07:08:09.123456789Z' },
      '[2026-05-06T07:08:10Z] INFO ferry docked',
      '[WARN] tide rising',
      'DEBUG cache warm',
      '  ready in 312 ms',
      '',
      'an error in lower case is no level',
    ]),
  ).toEqual([
    {
      time: '2026-05-06T07:08:09.123456789Z',
      level: 'error',
      message: 'boom',
      logger: null,
      stack: null,
    },
    {
      time: '2026-05-06T07:08:10Z',
      level: 'info',
      message: '[2026-05-06T07:08:10Z] INFO ferry docked',
      logger: null,
      stack: null,
    },
    { time: null, level: 'warn', message: 'tide rising', logger: null, stack: null },
    { time: null, level: 'debug', message: 'cache warm', logger: null, stack: null },
    { time: null, level: null, message: '  ready in 312 ms', logger: null, stack: null },
    {
      time: null,
      level: null,
      message: 'an error in lower case is no level',
      logger: null,
      stack: null,
    },
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
    ['next ship', null],
  ]);
});

test('a level filter keeps that level and the more severe ones', () => {
  const [error, warn, info, none] = parseLog(['ERROR a', 'WARN b', 'INFO c', 'plain d']);
  const kept = (level: Parameters<typeof atLeast>[1]) =>
    [error, warn, info, none].filter((entry) => entry && atLeast(entry, level)).length;
  expect([kept('error'), kept('warn'), kept('info'), kept(undefined)]).toEqual([1, 2, 3, 4]);
});

test('Rails, Django, zap, structlog and bunyan lines read too', () => {
  expect(
    parseLog([
      'I, [2026-05-06T07:08:09.123456 #4821]  INFO -- : Started GET "/tides" for 127.0.0.1',
      'E, [2026-05-06T07:08:10.000001 #4821] ERROR -- harbour: Moorings::BerthMissing',
      '[06/May/2026 07:08:11] "POST /moorings HTTP/1.1" 500 145',
      'ERROR 2026-05-06 07:08:12,345 log 4821 1234 Internal Server Error: /moorings',
      '{"level":"error","ts":1778051293.5,"logger":"tide.api","caller":"api/server.go:88","msg":"request failed","stacktrace":"main.serve\\n\\t/src/api/server.go:88"}',
      '{"event":"berth reserved","level":"info","timestamp":"2026-05-06T07:08:14Z","logger":"harbour"}',
      '{"name":"tide","level":40,"msg":"slow tide","time":"2026-05-06T07:08:15.000Z"}',
    ]),
  ).toEqual([
    {
      time: '2026-05-06T07:08:09.123456',
      level: 'info',
      message: 'Started GET "/tides" for 127.0.0.1',
      logger: null,
      stack: null,
    },
    {
      time: '2026-05-06T07:08:10.000001',
      level: 'error',
      message: 'Moorings::BerthMissing',
      logger: 'harbour',
      stack: null,
    },
    {
      time: null,
      level: null,
      message: '[06/May/2026 07:08:11] "POST /moorings HTTP/1.1" 500 145',
      logger: null,
      stack: null,
    },
    {
      time: null,
      level: 'error',
      message: '2026-05-06 07:08:12,345 log 4821 1234 Internal Server Error: /moorings',
      logger: null,
      stack: null,
    },
    {
      time: new Date(1778051293500).toISOString(),
      level: 'error',
      message: 'request failed',
      logger: 'tide.api',
      stack: 'main.serve\n\t/src/api/server.go:88',
    },
    {
      time: '2026-05-06T07:08:14Z',
      level: 'info',
      message: 'berth reserved',
      logger: 'harbour',
      stack: null,
    },
    {
      time: '2026-05-06T07:08:15.000Z',
      level: 'warn',
      message: 'slow tide',
      logger: null,
      stack: null,
    },
  ]);
});

test('pino, winston and logrus JSON lines read too', () => {
  expect(
    parseLog([
      '{"level":30,"time":1778051293500,"pid":1,"msg":"tide api listening"}',
      '{"level":"warn","message":"berth almost full","timestamp":"2026-05-06T07:08:14.000Z"}',
      '{"level":"error","msg":"anchor lost","time":"2026-05-06T07:08:15Z"}',
    ]).map(({ level, message }) => [level, message]),
  ).toEqual([
    ['info', 'tide api listening'],
    ['warn', 'berth almost full'],
    ['error', 'anchor lost'],
  ]);
});

test('a multi-megabyte line is matched on its start, quickly, and kept whole', () => {
  const payload = 'x'.repeat(4 * 1024 * 1024);
  const started = performance.now();
  const [spring, plain] = parseLog([
    `2026-01-02T10:11:12.345Z ERROR 1 --- [harbour] [main] c.e.Dock : body ${payload}`,
    `WARN ${' '.repeat(3 * 1024 * 1024)}tide`,
    `\tat ${'a.'.repeat(2 * 1024 * 1024)}`,
  ]);
  expect(performance.now() - started).toBeLessThan(1000);
  expect(spring?.message).toHaveLength(`body ${payload}`.length);
  expect(spring?.level).toBe('error');
  expect(plain?.level).toBe('warn');
  expect(spring?.stack).toBeNull();
  // A huge `at` line still folds under the entry before it, whole.
  expect(plain?.stack?.length).toBeGreaterThan(4 * 1024 * 1024);
});
