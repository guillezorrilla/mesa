import { rmSync } from 'node:fs';
import { staleLock } from '@mesa/core/testing';
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
    receipt: null,
  });
  expect((await mesa('stop', id)).stdout).toBe(`session ${id} had already ended\n`);

  const resumed = await mesa('resume', id, '--json');
  expect(resumed.json.data).toMatchObject({
    resumedFrom: id,
    agentSessionId: stopped.json.data.agentSessionId,
  });
  expect((await mesa('sessions', '--all')).stdout.split('\n').filter(Boolean)).toHaveLength(2);
  expect((await mesa('stop', 'zzzzzzzz')).code).toBe(3);

  // The old record cannot be claimed (a killed mesa left its lock): the resume is refused before
  // anything starts, and runs once the lock is gone.
  const again = resumed.json.data.id;
  await mesa('stop', again);
  const lock = staleLock(cli.home, again);
  const refused = await mesa('resume', again, '--json');
  expect(refused.json.error).toMatchObject({ code: 'locked' });
  expect((await mesa('sessions', '--all')).stdout.split('\n').filter(Boolean)).toHaveLength(2);
  rmSync(lock);
  expect((await mesa('resume', again, '--json')).json.data.resumedFrom).toBe(again);
  // The locked record is waited for, 400 pauses of 5 ms, before the refusal: about 2 s here and
  // two or three times that on a CI runner, whose timers are coarser.
}, 30_000);

test('stop and rm descendants require the confirmed IDs and report each item', async () => {
  cli.withTmux();
  await cli.withProject();
  const parent = (await mesa('open', 'lantern-cove')).stdout.trim();
  const child = (await mesa('open', 'lantern-cove', '--parent', parent)).stdout.trim();
  expect((await mesa('stop', parent, '--descendants', '--json')).json.error.message).toContain(
    '--expect',
  );
  expect((await mesa('rm', parent, '--descendants', '--json')).json.error.message).toContain(
    '--expect',
  );
  const mismatched = await mesa('stop', parent, '--descendants', '--expect=wrong', '--json');
  expect(mismatched.code).toBe(2);
  expect(mismatched.json.error.message).toContain('descendants changed');
  const expected = `--expect=${child},${parent}`;
  const stopped = await mesa('stop', parent, '--descendants', expected, '--force', '--json');
  expect(
    stopped.json.data.items.map((item: { id: string; ok: boolean }) => [item.id, item.ok]),
  ).toEqual([
    [child, true],
    [parent, true],
  ]);
  const removed = await mesa('rm', parent, '--descendants', expected, '--json');
  expect(
    removed.json.data.items.map((item: { id: string; ok: boolean }) => [item.id, item.ok]),
  ).toEqual([
    [child, true],
    [parent, true],
  ]);
  expect((await mesa('sessions', '--all', '--json')).json.data).toEqual([]);
});
