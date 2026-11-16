import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Env, Runner } from '../../lib/process.js';
import { profileOfTmuxSocket, profilePaths } from '../../profile/paths.js';
import { tmuxBackend } from './backend.js';

/**
 * A tmux server named for a Mesa profile (`mesa-<profile>`) whose profile folder is gone: its
 * socket, its live windows, and `inUse` when one of them was active within the hour, or tmux did
 * not say what it holds.
 */
export type LeftoverServer = { profile: string; socket: string; windows: number; inUse: boolean };

type Deps = {
  run: Runner;
  home: string;
  env: Env;
  clock: () => Date;
  sleep: (ms: number) => Promise<void>;
};

/** A server active this recently may be another home's live work (a test, an agent's throwaway profile). */
const IN_USE_MS = 60 * 60_000;

const tmuxOf = (deps: Deps, profile: string) =>
  tmuxBackend({ ...deps, socket: profilePaths(deps.home, profile).tmuxSocket });

const isSocket = (path: string) => {
  try {
    return lstatSync(path).isSocket();
  } catch {
    return false;
  }
};

/** tmux's own socket folder: `$TMUX_TMPDIR` or /tmp, then `tmux-<uid>`, as tmux picks it. */
async function socketFolder({ run, env }: Deps): Promise<string | undefined> {
  const id = await run('id', ['-u'], 2000);
  if (!id.ok) return undefined;
  return join(env.TMUX_TMPDIR || '/tmp', `tmux-${id.stdout.trim()}`);
}

/**
 * The tmux servers left by deleted profiles: each `mesa-<profile>` socket in tmux's folder with
 * no profile folder, with what it still runs. A profile that exists is never one.
 */
export async function leftoverServers(deps: Deps): Promise<LeftoverServer[]> {
  const folder = await socketFolder(deps);
  if (!folder || !existsSync(folder)) return [];
  const named = readdirSync(folder)
    .sort()
    .flatMap((file) => {
      const profile = profileOfTmuxSocket(file);
      const socket = join(folder, file);
      const gone = profile && !existsSync(profilePaths(deps.home, profile).root);
      return gone && isSocket(socket) ? [{ profile, socket }] : [];
    });
  const since = deps.clock().getTime() - IN_USE_MS;
  return Promise.all(
    named.map(async (server) => {
      // A failure other than "nothing there" leaves it unknown, so it counts as in use.
      const windows = await tmuxOf(deps, server.profile)
        .listWindows()
        .catch(() => undefined);
      const active = windows?.some((w) => !w.dead && Date.parse(w.activity) > since);
      return {
        ...server,
        windows: windows?.filter((w) => !w.dead).length ?? 0,
        inUse: windows === undefined || Boolean(active),
      };
    }),
  );
}

/**
 * Stops each leftover server not in use (its windows with it) and removes a socket it leaves;
 * one in use, or one that will not stop, is left as it was. Returns what it stopped.
 */
export async function stopLeftoverServers(deps: Deps): Promise<LeftoverServer[]> {
  const stopped: LeftoverServer[] = [];
  for (const server of await leftoverServers(deps)) {
    if (server.inUse) continue;
    try {
      await tmuxOf(deps, server.profile).killServer();
    } catch {
      // Still answering: its socket stays, so it can be reached and stopped later.
      continue;
    }
    if (isSocket(server.socket)) rmSync(server.socket, { force: true });
    stopped.push(server);
  }
  return stopped;
}
