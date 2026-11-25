import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
import { logFile, logSources } from './sources.js';

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

test("sources: running containers, the project's unended sessions with a log, terminals first, then its log files", async () => {
  const { deps, agent, shell } = setUp({
    docker: 'echo-logs\talpine\tUp 3 minutes\nharbour-db\tpostgres:17\tUp 2 hours\n',
  });
  mkdirSync(join(deps.serverLogs, 'lantern-cove'), { recursive: true });
  writeFileSync(logFile(deps.serverLogs, 'lantern-cove', 'tide-api'), '');
  writeFileSync(join(deps.serverLogs, 'lantern-cove', 'notes.txt'), '');
  expect(await logSources(deps, 'lantern-cove')).toEqual([
    { id: 'docker:echo-logs', kind: 'docker', name: 'echo-logs', detail: 'alpine, Up 3 minutes' },
    {
      id: 'docker:harbour-db',
      kind: 'docker',
      name: 'harbour-db',
      detail: 'postgres:17, Up 2 hours',
    },
    {
      id: `session:${shell.id}`,
      kind: 'session',
      name: 'harbour api',
      detail: `terminal session ${shell.id}`,
    },
    {
      id: `session:${agent.id}`,
      kind: 'session',
      name: 'fix the tides',
      detail: `claude session ${agent.id}`,
    },
    { id: 'file:tide-api', kind: 'file', name: 'tide-api', detail: 'log file' },
  ]);
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
      { time: null, level: 'error', message: 'ERROR boom', stack: '    at dock (src/dock.ts:1:1)' },
      { time: null, level: 'warn', message: 'WARN slow', stack: null },
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
  const read = () => readLog(deps, 'file:tide-api', { project: 'lantern-cove' });
  expect((await read()).entries.map((entry) => entry.message)).toEqual(['INFO one', 'ERROR two']);
  writeFileSync(file, 'INFO fresh run\n');
  expect((await read()).entries.map((entry) => entry.message)).toEqual(['INFO fresh run']);
  await expect(readLog(deps, 'file:../secrets', { project: 'lantern-cove' })).rejects.toMatchObject(
    {
      code: 'usage',
    },
  );
  await expect(readLog(deps, 'file:gone', { project: 'lantern-cove' })).rejects.toMatchObject({
    code: 'not_found',
  });
  expect(existsSync(file)).toBe(true);
});

test('since takes an age or an ISO time, and refuses anything else', async () => {
  expect(sinceTime('90s', NOW)).toBe('2026-05-06T07:08:30.000Z');
  expect(sinceTime('2026-05-06T00:00:00Z', NOW)).toBe('2026-05-06T00:00:00.000Z');
  expect(() => sinceTime('yesterday', NOW)).toThrow(/--since/);
  await expect(readLog({} as never, 'docker:--privileged')).rejects.toMatchObject({ code: 'usage' });
  await expect(readLog({} as never, 'nowhere')).rejects.toMatchObject({ code: 'usage' });
});
