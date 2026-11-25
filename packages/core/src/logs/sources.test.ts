import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  lockDeps,
  newSession,
  plantOutputLog,
  profilePaths,
  scriptedRunner,
  tempDir,
  testStore,
} from '../testing/index.js';
import { readLog, sinceTime } from './read.js';
import { logFile, logSources, projectModules } from './sources.js';

const NOW = new Date('2026-05-06T07:10:00.000Z');

/** A profile with project lantern-cove's terminal and agent sessions, one ended, and docker as given. */
function setUp(
  docker: Parameters<typeof scriptedRunner>[0] = {},
  opts: Parameters<typeof scriptedRunner>[1] = {},
) {
  const home = tempDir();
  const store = testStore(home);
  const paths = profilePaths(home, 'default');
  const agent = store.create(() => newSession({ project: 'lantern-cove', name: 'fix the tides' }));
  const shell = store.create(() =>
    newSession({
      project: 'lantern-cove',
      agent: 'terminal',
      kind: 'terminal',
      name: 'harbour api',
    }),
  );
  const ended = store.create(() =>
    newSession({ project: 'lantern-cove', endedAt: '2026-05-06T06:00:00.000Z' }),
  );
  const other = store.create(() => newSession({ project: 'quiet-reef' }));
  store.create(() => newSession({ project: 'lantern-cove' }));
  for (const id of [agent.id, ended.id, other.id]) plantOutputLog(home, id, 'hello\n');
  plantOutputLog(
    home,
    shell.id,
    '\x1b[32mINFO\x1b[0m started\r\nERROR boom\r\n    at dock (src/dock.ts:1:1)\r\nWARN slow\r\n',
  );
  const { run, calls } = scriptedRunner(docker, opts);
  const deps = {
    run,
    store,
    lock: lockDeps(),
    now: () => NOW,
    sessionLogs: paths.logs,
    serverLogs: paths.serverLogs,
  };
  return { deps, calls, agent, shell };
}

test("sources: containers running or exited within the hour, the project's sessions with a log, terminals first, then its log files, each with its state", async () => {
  const { deps, agent, shell, calls } = setUp({
    docker: [
      'echo-logs\talpine\tUp 3 minutes\trunning',
      'harbour-db\tpostgres:17\tUp 2 hours\trunning',
      'tide-worker\talpine\tExited (1) 5 minutes ago\texited',
      'old-job\talpine\tExited (0) 3 days ago\texited',
    ].join('\n'),
    sh: (args) => (args.at(-1) === 'echo-logs' ? '2026-05-06T07:09:50.000Z ERROR boom\n' : ''),
  });
  const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
  utimesSync(join(deps.sessionLogs, `${shell.id}.log`), ago(30), ago(30));
  utimesSync(join(deps.sessionLogs, `${agent.id}.log`), ago(600), ago(600));
  mkdirSync(join(deps.serverLogs, 'lantern-cove'), { recursive: true });
  const tide = logFile(deps.serverLogs, 'lantern-cove', 'tide-api');
  writeFileSync(tide, '');
  utimesSync(tide, ago(300), ago(300));
  writeFileSync(join(deps.serverLogs, 'lantern-cove', 'notes.txt'), '');
  expect(await logSources(deps, 'lantern-cove')).toEqual([
    {
      id: 'docker:echo-logs',
      kind: 'docker',
      name: 'echo-logs',
      detail: 'alpine, Up 3 minutes',
      state: 'live',
      lastLine: '2026-05-06T07:09:50.000Z',
    },
    {
      id: 'docker:harbour-db',
      kind: 'docker',
      name: 'harbour-db',
      detail: 'postgres:17, Up 2 hours',
      state: 'quiet',
      lastLine: null,
    },
    {
      id: 'docker:tide-worker',
      kind: 'docker',
      name: 'tide-worker',
      detail: 'alpine, Exited (1) 5 minutes ago',
      state: 'stopped',
      lastLine: null,
    },
    {
      id: `session:${shell.id}`,
      kind: 'session',
      name: 'harbour api',
      detail: `terminal session ${shell.id}`,
      state: 'live',
      lastLine: ago(30).toISOString(),
    },
    {
      id: `session:${agent.id}`,
      kind: 'session',
      name: 'fix the tides',
      detail: `claude session ${agent.id}`,
      state: 'quiet',
      lastLine: ago(600).toISOString(),
    },
    {
      id: 'file:tide-api',
      kind: 'file',
      name: 'tide-api',
      detail: 'log file',
      state: 'quiet',
      lastLine: ago(300).toISOString(),
    },
  ]);
  expect(calls[0]?.args).toEqual([
    'ps',
    '--all',
    '--filter',
    'status=running',
    '--filter',
    'status=exited',
    '--format',
    '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}',
  ]);
});

test("a project's modules are its top-level folders with a Gradle, Maven or npm build file", () => {
  const dir = tempDir();
  for (const [folder, build] of [
    ['tide-api', 'build.gradle.kts'],
    ['berth-service', 'pom.xml'],
    ['harbour-web', 'package.json'],
    ['docs', 'README.md'],
    ['.gradle', 'build.gradle'],
  ] as const) {
    mkdirSync(join(dir, folder));
    writeFileSync(join(dir, folder, build), '');
  }
  expect(projectModules(dir)).toEqual(['berth-service', 'harbour-web', 'tide-api']);
  expect(projectModules(join(dir, 'gone'))).toEqual([]);
});

test('no containers, and no error, when docker is missing or its daemon is down', async () => {
  for (const opts of [{ missing: ['docker'] }, { failing: ['docker'] }]) {
    const { deps } = setUp({}, opts);
    expect((await logSources(deps, 'lantern-cove')).map((source) => source.kind)).toEqual([
      'session',
      'session',
    ]);
  }
});

test("a session's log reads as entries, filtered by level and cut to the last ones", async () => {
  const { deps, shell } = setUp();
  const read = await readLog(deps, `session:${shell.id}`, { level: 'warn' });
  expect(read).toEqual({
    source: `session:${shell.id}`,
    entries: [
      {
        time: null,
        level: 'error',
        message: 'ERROR boom',
        logger: null,
        stack: '    at dock (src/dock.ts:1:1)',
      },
      { time: null, level: 'warn', message: 'WARN slow', logger: null, stack: null },
    ],
  });
  expect((await readLog(deps, `session:${shell.id}`, { tail: 1 })).entries).toHaveLength(1);
  await expect(readLog(deps, 'session:zzzzzzzz')).rejects.toMatchObject({ code: 'not_found' });
});

test("a container's logs come through docker, its stderr too, stamped by docker", async () => {
  const { deps, calls } = setUp({
    sh: '2026-05-06T07:08:09.1Z ERROR boom\n2026-05-06T07:09:59.2Z ERROR again\n',
  });
  const read = await readLog(deps, 'docker:echo-logs', { level: 'error', tail: 3, since: '5m' });
  expect(calls.at(-1)?.args).toEqual([
    '-c',
    'exec docker logs "$@" 2>&1',
    'sh',
    '--timestamps',
    '--tail',
    '2000',
    '--since',
    '2026-05-06T07:05:00.000Z',
    'echo-logs',
  ]);
  expect(read.entries.map((entry) => entry.time)).toEqual([
    '2026-05-06T07:08:09.1Z',
    '2026-05-06T07:09:59.2Z',
  ]);
  expect(
    (await readLog(deps, 'docker:echo-logs', { since: '2026-05-06T07:09:00Z' })).entries,
  ).toHaveLength(1);
});

test('a log file reads anew each time, so a rewritten file starts over', async () => {
  const { deps } = setUp();
  const file = logFile(deps.serverLogs, 'lantern-cove', 'tide-api');
  mkdirSync(join(deps.serverLogs, 'lantern-cove'), { recursive: true });
  writeFileSync(file, 'INFO one\nERROR two\n');
  const read = () => readLog(deps, 'file:tide-api', { project: () => 'lantern-cove' });
  expect((await read()).entries.map((entry) => entry.message)).toEqual(['INFO one', 'ERROR two']);
  writeFileSync(file, 'INFO fresh run\n');
  expect((await read()).entries.map((entry) => entry.message)).toEqual(['INFO fresh run']);
  await expect(
    readLog(deps, 'file:../secrets', { project: () => 'lantern-cove' }),
  ).rejects.toMatchObject({
    code: 'usage',
  });
  await expect(readLog(deps, 'file:gone', { project: () => 'lantern-cove' })).rejects.toMatchObject(
    {
      code: 'not_found',
    },
  );
  expect(existsSync(file)).toBe(true);
});

test('since takes an age or an ISO time, and refuses anything else', async () => {
  expect(sinceTime('90s', NOW)).toBe('2026-05-06T07:08:30.000Z');
  expect(sinceTime('2026-05-06T00:00:00Z', NOW)).toBe('2026-05-06T00:00:00.000Z');
  expect(() => sinceTime('yesterday', NOW)).toThrow(/--since/);
  await expect(readLog({} as never, 'docker:--privileged')).rejects.toMatchObject({
    code: 'usage',
  });
  await expect(readLog({} as never, 'nowhere')).rejects.toMatchObject({ code: 'usage' });
});
