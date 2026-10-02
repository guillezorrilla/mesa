import { join } from 'node:path';
import type { Env } from '../../lib/process.js';

// Where Claude Code keeps its files under a home directory: the one module that knows them.

/**
 * Its user settings, where Mesa's hooks go (ADR-0003); under CLAUDE_CONFIG_DIR when `env` sets it,
 * as Claude reads them there.
 */
export const claudeSettings = (home: string, env: Env = {}) =>
  join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json');

/** Every session's transcript, `<folder>/<agent session id>.jsonl`, one folder per working folder. */
export const claudeTranscripts = (home: string) => join(home, '.claude', 'projects');
