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
