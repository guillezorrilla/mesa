import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { scriptedRunner, tempDir } from '../../testing/index.js';
import { leftoverServers, stopLeftoverServers } from './leftovers.js';

/** A home with profile `keep`, and tmux's folder holding sockets for kept, deleted and other names. */
function world({ killFails = false } = {}) {
  const home = tempDir();
  mkdirSync(join(home, '.mesa', 'keep'), { recursive: true });
  const tmp = tempDir();
  const folder = join(tmp, 'tmux-501');
  mkdirSync(folder);
  for (const name of ['mesa-keep', 'mesa-gone', 'mesa-stale', 'mesa-young', 'other-server'])
    writeFileSync(join(folder, name), '');
  const killed: string[] = [];
  const { run } = scriptedRunner({
    id: '501\n',
    tmux: (args) => {
      const socket = args[1] ?? '';
      if (args[2] === 'kill-server') {
        if (killFails) return { ok: false, reason: 'failed', detail: 'permission denied' };
        killed.push(socket);
        return '';
      }
      if (socket.endsWith('mesa-stale'))
        return { ok: false, reason: 'failed', detail: `no server running on ${socket}` };
      // Sessions created as epoch seconds: two days ago, or ten minutes before the clock.
      return socket.endsWith('mesa-young') ? '1790000000\n1790085000\n' : '1789900000\n';
    },
  });
  const clock = () => new Date(1790085600 * 1000);
  return { deps: { run, home, env: { TMUX_TMPDIR: tmp }, clock }, folder, killed };
}

test('servers named for a deleted profile are leftovers; a kept profile and other names are not', async () => {
  const { deps, folder } = world();
  expect(await leftoverServers(deps)).toEqual([
    { name: 'gone', socket: join(folder, 'mesa-gone'), running: true, recent: false },
    { name: 'stale', socket: join(folder, 'mesa-stale'), running: false, recent: false },
    { name: 'young', socket: join(folder, 'mesa-young'), running: true, recent: true },
  ]);
});

test('stopping kills an old running leftover and removes both sockets; a kept profile and a young server stay', async () => {
  const { deps, folder, killed } = world();
  expect((await stopLeftoverServers(deps)).map((s) => s.name)).toEqual(['gone', 'stale']);
  expect(killed).toEqual([join(folder, 'mesa-gone')]);
  const left = ['mesa-keep', 'mesa-gone', 'mesa-stale', 'mesa-young'];
  expect(left.map((f) => existsSync(join(folder, f)))).toEqual([true, false, false, true]);
  expect((await leftoverServers(deps)).map((s) => s.name)).toEqual(['young']);
});

test('a server that will not stop keeps its socket, so it can still be reached', async () => {
  const { deps, folder } = world({ killFails: true });
  expect((await stopLeftoverServers(deps)).map((s) => s.name)).toEqual(['stale']);
  expect(existsSync(join(folder, 'mesa-gone'))).toBe(true);
});
