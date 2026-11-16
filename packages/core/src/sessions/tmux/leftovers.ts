import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Env, Runner } from '../../lib/process.js';
import { profilesDir } from '../../profile/paths.js';

/**
 * A tmux server named for a Mesa profile (`mesa-<profile>`) whose profile folder is gone; `recent`
 * when one of its sessions was created within the hour.
 */
export type LeftoverServer = { name: string; socket: string; running: boolean; recent: boolean };

type Deps = { run: Runner; home: string; env: Env; clock: () => Date };

/** A server this young may be another home's live work (a test or an agent's throwaway profile). */
const RECENT_MS = 60 * 60_000;

/** tmux's own socket folder: `$TMUX_TMPDIR` or /tmp, then `tmux-<uid>`, as tmux picks it. */
async function socketFolder({ run, env }: Deps): Promise<string | undefined> {
  const id = await run('id', ['-u'], 2000);
  if (!id.ok) return undefined;
  return join(env.TMUX_TMPDIR || '/tmp', `tmux-${id.stdout.trim()}`);
}

/**
 * The tmux servers left by deleted profiles: each `mesa-<name>` socket in tmux's folder with no
 * `~/.mesa/<name>`, and whether a server still answers on it. A profile that exists is never one.
 */
export async function leftoverServers(deps: Deps): Promise<LeftoverServer[]> {
  const folder = await socketFolder(deps);
  if (!folder || !existsSync(folder)) return [];
  const profiles = profilesDir(deps.home);
  const named = readdirSync(folder)
    .filter((file) => file.startsWith('mesa-'))
    .sort()
    .map((file) => ({ name: file.slice('mesa-'.length), socket: join(folder, file) }))
    .filter(({ name }) => name && !existsSync(join(profiles, name)));
  return Promise.all(
    named.map(async (server) => {
      const answer = await deps.run(
        'tmux',
        ['-S', server.socket, 'list-sessions', '-F', '#{session_created}'],
        2000,
      );
      // Only "no server running" proves it gone; any other failure keeps it, so it is never orphaned.
      const gone = !answer.ok && /no server running/.test(answer.detail);
      const created = answer.ok ? answer.stdout.split('\n').map(Number).filter(Boolean) : [];
      const since = deps.clock().getTime() - RECENT_MS;
      return { ...server, running: !gone, recent: created.some((s) => s * 1000 > since) };
    }),
  );
}

/**
 * Stops each leftover server (`kill-server`, its sessions with it) and removes its socket file;
 * a socket nothing answers on is only removed. A recent one, and one that does not stop, are left
 * as they were. Returns what it stopped or removed.
 */
export async function stopLeftoverServers(deps: Deps): Promise<LeftoverServer[]> {
  const found = await leftoverServers(deps);
  const stopped: LeftoverServer[] = [];
  for (const server of found) {
    if (server.recent) continue;
    // A server that will not stop keeps its socket, so it can still be reached and stopped.
    if (server.running && !(await deps.run('tmux', ['-S', server.socket, 'kill-server'], 2000)).ok)
      continue;
    rmSync(server.socket, { force: true });
    stopped.push(server);
  }
  return stopped;
}
