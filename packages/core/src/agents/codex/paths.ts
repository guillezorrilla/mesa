import { join } from 'node:path';
import type { Env } from '../../lib/process.js';

// Where Codex keeps its files: the one module that knows them (docs/spikes/codex.md).

/** Codex's home: `CODEX_HOME` from the environment codex runs with, else `~/.codex`. */
export const codexHome = (env: Env, home: string) => env.CODEX_HOME || join(home, '.codex');

/** Every thread's rollout, `<local YYYY>/<MM>/<DD>/rollout-<local time>-<thread id>.jsonl`. */
export const codexSessions = (codexHome: string) => join(codexHome, 'sessions');

/** The app-server daemon's socket, there while it runs: a plain `codex` then attaches to it. */
export const codexDaemonSocket = (codexHome: string) =>
  join(codexHome, 'app-server-control', 'app-server-control.sock');

/** User hook definitions and the config where Codex records their trust. */
export const codexHooks = (home: string) => join(home, 'hooks.json');
export const codexConfig = (home: string) => join(home, 'config.toml');
