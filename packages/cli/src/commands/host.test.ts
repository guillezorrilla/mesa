import type { Stdio } from '@mesa/core';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('open --view structured runs mesa host in the window; host refuses a Terminal session', async () => {
  const world = cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--view', 'structured', '--json')).json.data;
  expect(opened.view).toBe('structured');
  expect(world.windows[0]?.launch).toContain(` host ${opened.id}`);

  const plain = (await mesa('open', 'lantern-cove', '--json')).json.data;
  expect(await mesa('host', plain.id)).toMatchObject({
    code: 2,
    stderr: `session ${plain.id} is not a Structured Claude Code session\n`,
  });
  expect(await mesa('open', 'lantern-cove', '--view', 'sideways')).toMatchObject({
    code: 2,
    stderr: 'unknown view sideways; use terminal or structured\n',
  });
});

test('chat --follow prints a Terminal session chat as one JSON line, then ends', async () => {
  cli.withTmux();
  await cli.withProject();
  const plain = (await mesa('open', 'lantern-cove', '--json')).json.data;
  const started = await mesa('chat', plain.id, '--follow');
  expect([started.code, started.stdout, started.stderr]).toEqual([0, '', '']);
  const written: string[] = [];
  await (started.serve as (io: Stdio) => Promise<void>)({
    lines: (async function* () {})(),
    write: (text) => written.push(text),
    log: () => undefined,
  });
  expect(written.map((line) => JSON.parse(line).type)).toEqual(['chat']);
});
