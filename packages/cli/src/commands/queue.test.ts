import { plantQueuedMessage } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test("queue list prints the phone's queued replies, and remove takes one back once", async () => {
  await cli.mesa('init', '--vault', 'vault');
  const first = plantQueuedMessage(cli.home, 'a1b2c3d4', 'then the docs');
  plantQueuedMessage(cli.home, 'e5f6a7b8', 'and the changelog');

  const all = (await cli.mesa('queue', 'list', '--json')).json.data;
  expect(all).toEqual([
    {
      id: first,
      session: 'a1b2c3d4',
      text: 'then the docs',
      at: '2026-09-24T12:00:00.000Z',
      from: 'phone',
    },
    expect.objectContaining({ session: 'e5f6a7b8', text: 'and the changelog' }),
  ]);
  expect((await cli.mesa('queue', 'list', 'a1b2c3d4', '--json')).json.data).toHaveLength(1);

  expect((await cli.mesa('queue', 'remove', first, '--json')).json.data).toEqual({
    id: first,
    removed: true,
  });
  const again = await cli.mesa('queue', 'remove', first, '--json');
  expect(again.code).not.toBe(0);
  expect(again.json.error.message).toContain('is no longer queued');
  expect((await cli.mesa('queue', 'list', 'a1b2c3d4')).stdout.trim()).toBe('nothing queued');
});
