import { expect, test } from 'vitest';
import { parseLog } from './parse.js';
import { ownFrame, stackSummary, stackView } from './stack.js';

const TRACE =
  'com.example.harbour.MooringException: berth is null\n\tat org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)\n\tat com.example.harbour.moorings.MooringService.reserve(MooringService.java:88)\n\tat com.example.harbour.web.MooringController.create(MooringController.java:42)\n\tat java.base/java.lang.Thread.run(Thread.java:1583)\nCaused by: java.lang.IllegalStateException: tide out\n\t... 12 more';

test("a stack folds to its exception and the project's first own frame; framework frames are marked", () => {
  const view = stackView(TRACE);
  expect(view.folded.map((line) => line.text)).toEqual([
    'com.example.harbour.MooringException: berth is null',
    '\tat com.example.harbour.moorings.MooringService.reserve(MooringService.java:88)',
  ]);
  expect(view.hidden).toBe(5);
  expect(view.lines.filter((line) => line.framework).map((line) => line.text.trim())).toEqual([
    'at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)',
    'at java.base/java.lang.Thread.run(Thread.java:1583)',
  ]);
  expect(ownFrame(TRACE)).toBe('MooringService.java:88');
  expect(
    ownFrame('    at readChart (node:internal/fs:12:3)\n    at chart (src/chart.ts:88:31)'),
  ).toBe('chart.ts:88');
  expect(ownFrame(null)).toBeUndefined();
  expect(ownFrame('\tat com.example.Dock.moor(Unknown Source)')).toBeUndefined();
});

test('a hostile frame line folds at once, with no backtracking', () => {
  const started = performance.now();
  stackView(`at${'\t'.repeat(50_000)}x\n(${"'".repeat(50_000)}`);
  ownFrame(`\tat x(${'('.repeat(50_000)}a:1)`);
  expect(performance.now() - started).toBeLessThan(200);
});

test('for an agent, runs of framework frames become one line', () => {
  expect(stackSummary(TRACE)).toBe(
    [
      'com.example.harbour.MooringException: berth is null',
      '    ... 1 framework frame',
      '\tat com.example.harbour.moorings.MooringService.reserve(MooringService.java:88)',
      '\tat com.example.harbour.web.MooringController.create(MooringController.java:42)',
      '    ... 1 framework frame',
      'Caused by: java.lang.IllegalStateException: tide out',
      '\t... 12 more',
    ].join('\n'),
  );
});

test('500 entries with 150-frame stacks parse and fold quickly', () => {
  const frames = Array.from({ length: 150 }, (_, at) =>
    at % 10
      ? `\tat org.springframework.Layer${at}.call(Layer.java:${at})`
      : `\tat com.example.Own${at}.run(Own.java:${at})`,
  );
  const lines = Array.from({ length: 500 }, (_, at) => [
    `2026-01-02T10:11:${String(at % 60).padStart(2, '0')}.000Z ERROR 1 --- [harbour] [main] c.e.Dock : boom ${at}`,
    'com.example.MooringException: berth is null',
    ...frames,
  ]).flat();
  const started = performance.now();
  const entries = parseLog(lines);
  for (const entry of entries) stackView(entry.stack ?? '');
  expect(entries).toHaveLength(500);
  expect(performance.now() - started).toBeLessThan(1500);
});
