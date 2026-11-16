import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { scriptedRunner, tempDir } from '../../testing/index.js';
import { leftoverServers, stopLeftoverServers } from './leftovers.js';

/** A listening unix socket at `path`, as a tmux server's is, closed when the test ends. */
async function socketAt(path: string) {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(path, resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
}

const NOW = 1790085600;
/** One live window last active `ago` seconds before NOW, as `list-windows -F FORMAT` prints it. */
const windowLine = (ago: number) =>
  ['lantern', '0', 'claude-aaaa', '123', 'claude', '/tmp', `${NOW - ago}`, '0', '', '', ''].join(
    '\t',
  );

/**
 * A home with profile `keep`, and tmux's folder (a short path: sockets allow about 100 bytes)
 * holding sockets for a kept profile, deleted ones idle, stale or in use, a plain file, and
 * another name.
 */
async function world({ killFails = false } = {}) {
  const home = tempDir();
  mkdirSync(join(home, '.mesa', 'keep'), { recursive: true });
  const tmp = mkdtempSync('/tmp/mesa-left-');
  // Registered first, so it runs last: after the sockets close.
  onTestFinished(() => rmSync(tmp, { recursive: true, force: true }));
  const folder = join(tmp, 'tmux-501');
  mkdirSync(folder);
  for (const name of ['mesa-keep', 'mesa-idle', 'mesa-stale', 'mesa-busy', 'other'])
    await socketAt(join(folder, name));
  writeFileSync(join(folder, 'mesa-file'), '');
  const killed: string[] = [];
  const { run } = scriptedRunner({
    id: '501\n',
    tmux: (args) => {
      const name = args[args.indexOf('-L') + 1] ?? '';
      if (args.includes('kill-server')) {
        if (killFails) return { ok: false, reason: 'failed', detail: 'permission denied' };
        killed.push(name);
        return '';
      }
      if (name === 'mesa-stale')
        return { ok: false, reason: 'failed', detail: 'no server running on /tmp/x' };
      // Idle for two days, or typed in ten minutes ago.
      return `${windowLine(name === 'mesa-busy' ? 600 : 2 * 86_400)}\n`;
    },
  });
  const deps = {
    run,
    home,
    env: { TMUX_TMPDIR: tmp },
    clock: () => new Date(NOW * 1000),
    sleep: async () => {},
  };
  return { deps, folder, killed };
}

test('servers named for a deleted profile are leftovers; a kept profile, a plain file and other names are not', async () => {
  const { deps, folder } = await world();
  expect(await leftoverServers(deps)).toEqual([
    { profile: 'busy', socket: join(folder, 'mesa-busy'), windows: 1, inUse: true },
    { profile: 'idle', socket: join(folder, 'mesa-idle'), windows: 1, inUse: false },
    { profile: 'stale', socket: join(folder, 'mesa-stale'), windows: 0, inUse: false },
  ]);
});

test('stopping stops the idle and stale ones and removes their sockets; one in use, a kept profile and a plain file stay', async () => {
  const { deps, folder, killed } = await world();
  expect((await stopLeftoverServers(deps)).map((s) => s.profile)).toEqual(['idle', 'stale']);
  expect(killed).toEqual(['mesa-idle', 'mesa-stale']);
  const files = ['mesa-keep', 'mesa-busy', 'mesa-file', 'mesa-idle', 'mesa-stale'];
  expect(files.map((f) => existsSync(join(folder, f)))).toEqual([true, true, true, false, false]);
});

test('a server that will not stop keeps its socket, so it can still be reached', async () => {
  const { deps, folder } = await world({ killFails: true });
  expect(await stopLeftoverServers(deps)).toEqual([]);
  expect(existsSync(join(folder, 'mesa-idle'))).toBe(true);
});
