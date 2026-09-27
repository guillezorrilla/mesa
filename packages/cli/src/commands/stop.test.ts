import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('stop and resume print the updated and the new record', async () => {
  cli.withTmux({
    onKeys: (w, text) => {
      if (text === '/exit') w.dead = true;
    },
  });
  await cli.withProject();
  const id = (await mesa('open', 'lantern-cove')).stdout.trim();

  const stopped = await mesa('stop', id, '--json');
  expect(stopped.json.data).toMatchObject({
    id,
    outcome: 'exited',
    endedAt: '2026-09-24T12:00:00.000Z',
    lastState: { state: 'done' },
    receipt: { id: expect.stringMatching(/^01TEST/) },
  });
  expect((await mesa('stop', id)).stdout).toBe(`session ${id} had already ended\n`);

  const resumed = await mesa('resume', id, '--json');
  expect(resumed.json.data).toMatchObject({
    resumedFrom: id,
    agentSessionId: stopped.json.data.agentSessionId,
  });
  expect((await mesa('sessions', '--all')).stdout.split('\n').filter(Boolean)).toHaveLength(2);
  expect((await mesa('stop', 'zzzzzzzz')).code).toBe(3);

  // The old record cannot be marked resumed (a killed mesa left its lock): the resume runs, and
  // says so in its text and its --json.
  const again = resumed.json.data.id;
  await mesa('stop', again);
  const lock = join(cli.paths.sessions, `${again}.lock`);
  writeFileSync(lock, 'a killed mesa');
  const warned = await mesa('resume', again);
  expect(warned.stdout).toMatch(
    new RegExp(`\nwarning: session ${again} not marked resumed: session`),
  );
  rmSync(lock);
  const third = warned.stdout.split('\n')[0] ?? '';
  await mesa('stop', third);
  writeFileSync(join(cli.paths.sessions, `${third}.lock`), 'a killed mesa');
  expect((await mesa('resume', third, '--json')).json.data.warning).toMatch(
    new RegExp(`^session ${third} not marked resumed: session`),
  );
  // Each locked record is waited for, about 2 s, before the warning.
}, 15_000);
