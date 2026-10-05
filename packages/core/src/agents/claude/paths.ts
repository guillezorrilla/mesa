import { join } from 'node:path';
import type { Env } from '../../lib/process.js';

// Where Claude Code keeps its files under a home directory: the one module that knows them.

/** Claude Code's config folder: `CLAUDE_CONFIG_DIR` when `env` sets it, else `~/.claude`. */
export const claudeHome = (env: Env, home: string) =>
  env.CLAUDE_CONFIG_DIR || join(home, '.claude');

/**
 * Its user settings, where Mesa's hooks go (ADR-0003); under CLAUDE_CONFIG_DIR when `env` sets it,
 * as Claude reads them there.
 */
export const claudeSettings = (home: string, env: Env = {}) =>
  join(claudeHome(env, home), 'settings.json');

/** Its user instruction file, `CLAUDE.md`, and the folder of `.md` rules beside it. */
export const claudeMemory = (claudeHome: string) => join(claudeHome, 'CLAUDE.md');
export const claudeRules = (claudeHome: string) => join(claudeHome, 'rules');

/** Its user skills folder, and the plugins Claude Code installed, each with a `skills` folder. */
export const claudeSkills = (claudeHome: string) => join(claudeHome, 'skills');
export const claudeInstalledPlugins = (claudeHome: string) =>
  join(claudeHome, 'plugins', 'installed_plugins.json');

/** A project's own Claude Code files, relative to the project. */
export const CLAUDE_PROJECT_DIR = '.claude';
export const CLAUDE_PROJECT_SKILLS = join(CLAUDE_PROJECT_DIR, 'skills');

/** Every session's transcript, `<folder>/<agent session id>.jsonl`, one folder per working folder. */
export const claudeTranscripts = (home: string) => join(home, '.claude', 'projects');

/**
 * Each live Claude Code process's state, `<pid>.json`: among it the session's `name`, and
 * `nameSource`, `user` for a /rename and `derived` for the one Claude Code makes from its folder.
 */
export const claudeLiveSessions = (home: string) => join(home, '.claude', 'sessions');
