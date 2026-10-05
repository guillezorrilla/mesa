import { join } from 'node:path';
import type { Env } from '../../lib/process.js';

// Where Codex keeps its files: the one module that knows them (docs/spikes/codex.md).

/** Codex's home: `CODEX_HOME` from the environment codex runs with, else `~/.codex`. */
export const codexHome = (home: string, env: Env) => env.CODEX_HOME || join(home, '.codex');

/** Every thread's rollout, `<local YYYY>/<MM>/<DD>/rollout-<local time>-<thread id>.jsonl`. */
export const codexSessions = (codexHome: string) => join(codexHome, 'sessions');

/** Each thread's name as Codex shows it, one JSONL line per rename: `{id, thread_name, updated_at}`. */
export const codexSessionIndex = (codexHome: string) => join(codexHome, 'session_index.jsonl');

/** The app-server daemon's socket, there while it runs: a plain `codex` then attaches to it. */
export const codexDaemonSocket = (codexHome: string) =>
  join(codexHome, 'app-server-control', 'app-server-control.sock');

/** User hook definitions and the config where Codex records their trust. */
export const codexHooks = (home: string) => join(home, 'hooks.json');
export const codexConfig = (home: string) => join(home, 'config.toml');

/** Its user instruction files under its home: `AGENTS.override.md` wins over `AGENTS.md`. */
export const codexInstructions = (codexHome: string) => join(codexHome, 'AGENTS.md');
export const codexInstructionsOverride = (codexHome: string) =>
  join(codexHome, 'AGENTS.override.md');

/**
 * Where Codex reads skills, relative to a project and to the user's home alike (not under
 * CODEX_HOME). Antigravity reads a project's too.
 */
export const CODEX_SKILLS = join('.agents', 'skills');
