import { expect, test } from 'vitest';
import { lockDeps, profilePaths, scriptedRunner, tempDir, testStore } from '../testing/index.js';
import { requestMessage } from './message.js';
import { requestLines } from './request.js';

const LOGS: Record<string, string> = {
  'tide-gateway': [
    '2026-05-06T07:08:01.000Z INFO GET /moorings/9 reqId=7f3a',
    '2026-05-06T07:08:02.000Z INFO GET /tides 200 reqId=11bb',
    '2026-05-06T07:08:04.000Z WARN upstream 500 reqId=7f3a',
  ].join('\n'),
  'tide-api': [
    '2026-05-06T07:08:00.000Z INFO started',
    '2026-05-06T07:08:03.000Z {"level":"error","msg":"mooring failed requestId=7f3a","time":"2026-05-06T07:08:03.000Z"}',
    'java.lang.IllegalStateException: berth taken',
    '\tat org.springframework.web.Servlet.run(Servlet.java:1)',
    '\tat com.example.Moorings.reserve(Moorings.java:42)',
    'Caused by: java.sql.SQLException: lock timeout',
    '\tat com.example.Berths.lock(Berths.java:7)',
    '2026-05-06T07:08:05.000Z INFO done reqId=7f3a0',
  ].join('\n'),
};

function deps() {
  const home = tempDir();
  const paths = profilePaths(home, 'default');
  const { run } = scriptedRunner({ sh: (args) => LOGS[args.at(-1) ?? ''] ?? '' });
  return {
    run,
    store: testStore(home),
    lock: lockDeps(),
    now: () => new Date('2026-05-06T07:10:00.000Z'),
    sessionLogs: paths.logs,
    serverLogs: paths.serverLogs,
    logFiles: () => [],
  };
}

test('a request across sources: only its own lines, merged by time, each with its source and stack', async () => {
  const found = await requestLines(deps(), 'lantern-cove', '7f3a', [
    'docker:tide-gateway',
    'docker:tide-api',
    'file:tide-worker',
  ]);
  expect(found.entries.map((entry) => [entry.source, entry.message])).toEqual([
    ['docker:tide-gateway', 'GET /moorings/9 reqId=7f3a'],
    ['docker:tide-api', 'mooring failed requestId=7f3a'],
    ['docker:tide-gateway', 'upstream 500 reqId=7f3a'],
  ]);
  expect(found.entries[1]?.stack).toContain('Caused by: java.sql.SQLException: lock timeout');
  // A source that cannot be read is named, not an error.
  expect(found.failed).toEqual([
    { source: 'file:tide-worker', message: 'no log file tide-worker in project lantern-cove' },
  ]);

  const text = requestMessage({
    id: found.id,
    entries: found.entries,
    label: (source) => source.replace('docker:', 'Docker · '),
    time: () => '07:08',
  });
  expect(text).toContain('Sources: Docker · tide-gateway, Docker · tide-api');
  expect(text).toContain(
    [
      '07:08 [Docker · tide-api] ERROR mooring failed requestId=7f3a',
      'java.lang.IllegalStateException: berth taken',
      '    ... 1 framework frame',
      '\tat com.example.Moorings.reserve(Moorings.java:42)',
      'Caused by: java.sql.SQLException: lock timeout',
      '\tat com.example.Berths.lock(Berths.java:7)',
      '07:08 [Docker · tide-gateway] WARN upstream 500 reqId=7f3a',
    ].join('\n'),
  );
});

test('an untimed line keeps its place after the line before it in its source', async () => {
  const run = deps();
  LOGS['harbour-cron'] = [
    '2026-05-06T07:08:01.500Z INFO tick traceId=7f3a',
    'retry traceId=7f3a',
  ].join('\n');
  const found = await requestLines(run, 'lantern-cove', '7f3a', [
    'docker:tide-gateway',
    'docker:harbour-cron',
  ]);
  expect(found.entries.map((entry) => entry.message)).toEqual([
    'GET /moorings/9 reqId=7f3a',
    'tick traceId=7f3a',
    'retry traceId=7f3a',
    'upstream 500 reqId=7f3a',
  ]);
});
