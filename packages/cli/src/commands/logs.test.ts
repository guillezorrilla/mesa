import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Runner } from '@mesa/core';
import { plantOutputLog } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('logs prints the output log as plain text, --tail its last lines; rm removes it', async () => {
  const world = cli.withTmux();
  await cli.withProject();
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect(world.windows[0]?.pipe).toBe(`cat >> '${cli.paths.logs}/${id}.log'`);
  const file = plantOutputLog(
    cli.home,
    id,
    '\x1b[1mReading the tide tables\x1b[0m\r\n\r\nHigh water 06:12\r\nLow water 12:25\r\n',
  );

  expect(await mesa('logs', id)).toMatchObject({
    code: 0,
    stdout: 'Reading the tide tables\nHigh water 06:12\nLow water 12:25\n',
  });
  expect((await mesa('logs', id, '--tail', '2')).stdout).toBe(
    'High water 06:12\nLow water 12:25\n',
  );
  expect((await mesa('logs', id, '--tail', '1', '--json')).json.data).toEqual({
    session: id,
    path: file,
    lines: ['Low water 12:25'],
  });
  expect(await mesa('logs', id, '--tail', 'last')).toMatchObject({
    code: 2,
    stderr: '--tail must be a whole number, not last\n',
  });
  expect(await mesa('logs', 'zzzzzzzz')).toMatchObject({ code: 3 });

  expect((await mesa('rm', id, '--force')).stdout).toBe(
    `removed ${id}, with its window, its output log\n`,
  );
  expect(await mesa('logs', id)).toMatchObject({ code: 3 });
});

test('a session with no output log says so, and why it may have none', async () => {
  cli.withTmux();
  await cli.withProject();
  await mesa('config', 'set', 'sessions.log', 'false');
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  expect(await mesa('logs', id)).toMatchObject({
    code: 0,
    stdout: `session ${id} has no output log: it has not started, or config sessions.log was off when it did, or it started before Mesa kept output logs\n`,
  });
  expect((await mesa('logs', id, '--json')).json.data).toEqual({
    session: id,
    path: null,
    lines: [],
  });
});

/** The runner as it was, with docker answering `ps` and `sh` answering `docker logs`. */
function withDocker(ps: string, logs: string) {
  const base = cli.run;
  const run: Runner = async (file, args, timeoutMs, options) =>
    file === 'docker'
      ? { ok: true, stdout: ps }
      : file === 'sh'
        ? { ok: true, stdout: logs }
        : base(file, args, timeoutMs, options);
  cli.run = run;
}

test('logs sources lists containers, sessions with a log and log files; a source reads as entries', async () => {
  cli.withTmux();
  await cli.withProject();
  withDocker(
    'echo-logs\talpine\tUp 1 minute\trunning\n',
    '2026-05-06T07:08:09Z ERROR boom\n2026-05-06T07:08:10Z INFO fine\n2026-05-06T07:08:11Z ERROR boom\n',
  );
  const id = (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  plantOutputLog(cli.home, id, 'WARN tide rising\r\n');
  const named = (
    await mesa('logs', 'file', 'tide-api', '--project', 'lantern-cove', '--path-only', '--json')
  ).json.data;
  expect(existsSync(dirname(named.path))).toBe(false);
  const made = (await mesa('logs', 'file', 'tide-api', '--project', 'lantern-cove', '--json')).json
    .data;
  expect(made).toEqual(named);
  expect(existsSync(dirname(made.path))).toBe(true);
  expect(made).toEqual({
    path: `${cli.home}/.mesa/default/logs/lantern-cove/tide-api.log`,
    source: 'file:tide-api',
  });
  expect(existsSync(made.path)).toBe(false);
  writeFileSync(made.path, '2026-01-02T10:11:12.345Z ERROR 1 --- [demo] [main] c.e.Demo : boom\n');

  const sources = (await mesa('logs', 'sources', 'lantern-cove', '--json')).json.data.sources;
  expect(sources.map((source: { id: string }) => source.id)).toEqual([
    'docker:echo-logs',
    `session:${id}`,
    'file:tide-api',
  ]);
  expect(
    (await mesa('logs', 'docker:echo-logs', '--level', 'error', '--tail', '50', '--json')).json
      .data,
  ).toEqual({
    source: 'docker:echo-logs',
    entries: [
      {
        time: '2026-05-06T07:08:09Z',
        level: 'error',
        message: 'ERROR boom',
        logger: null,
        stack: null,
      },
      {
        time: '2026-05-06T07:08:11Z',
        level: 'error',
        message: 'ERROR boom',
        logger: null,
        stack: null,
      },
    ],
  });
  expect((await mesa('logs', `session:${id}`)).stdout).toBe('WARN tide rising\n');
  expect((await mesa('logs', 'file:tide-api', '--project', 'lantern-cove')).stdout).toBe(
    '2026-01-02T10:11:12.345Z ERROR boom\n',
  );
  expect(await mesa('logs', 'docker:echo-logs', '--level', 'loud')).toMatchObject({
    code: 2,
    stderr: '--level must be one of error, warn, info, debug, not loud\n',
  });
  expect(await mesa('logs', 'sources', 'no-such-project')).toMatchObject({ code: 3 });
  expect(await mesa('logs', 'file', '../escape', '--project', 'lantern-cove')).toMatchObject({
    code: 2,
  });
});

test('logs modules lists the top-level folders with a build file', async () => {
  const dir = await cli.withProject();
  mkdirSync(join(dir, 'tide-api'));
  writeFileSync(join(dir, 'tide-api', 'build.gradle.kts'), '');
  mkdirSync(join(dir, 'notes'));
  expect((await mesa('logs', 'modules', 'lantern-cove', '--json')).json.data).toEqual({
    modules: ['tide-api'],
  });
});

test("logs.panel hides the Logs button for one project: the project's override, else the profile's", async () => {
  await cli.withProject();
  const shown = async () => (await mesa('projects', '--json')).json.data[0].logsPanel;
  expect(await shown()).toBe(true);
  expect((await mesa('projects', 'set', 'lantern-cove', 'logs.panel', 'false')).code).toBe(0);
  expect(await shown()).toBe(false);
  await mesa('projects', 'set', 'lantern-cove', 'logs.panel', '--unset');
  await mesa('config', 'set', 'logs.panel', 'false');
  expect(await shown()).toBe(false);
  await mesa('projects', 'set', 'lantern-cove', 'logs.panel', 'true');
  expect(await shown()).toBe(true);
});
