import { join } from 'node:path';

// Where Antigravity keeps its files: the one module that knows them.

/** Its home, `~/.gemini`, with its `config` folder and its CLI's `antigravity-cli` folder. */
const antigravityHome = (home: string) => join(home, '.gemini');
const antigravityConfig = (home: string) => join(antigravityHome(home), 'config');
const antigravityCli = (home: string) => join(antigravityHome(home), 'antigravity-cli');

/** Its global hooks, where Mesa's instruction hook goes. */
export const antigravityHooks = (home: string) => join(antigravityConfig(home), 'hooks.json');

/** Its global MCP config, and the CLI settings that hold its allow rules (ADR-0012). */
export const antigravityMcpConfig = (home: string) =>
  join(antigravityConfig(home), 'mcp_config.json');
export const antigravityCliSettings = (home: string) => join(antigravityCli(home), 'settings.json');

/** Its plugins, each a folder that may hold `rules` and `skills`. */
export const antigravityPlugins = (home: string) => join(antigravityCli(home), 'plugins');
export const antigravityPluginRules = (home: string, plugin: string) =>
  join(antigravityPlugins(home), plugin, 'rules');
export const antigravityPluginSkills = (home: string, plugin: string) =>
  join(antigravityPlugins(home), plugin, 'skills');

/** Its global instruction files: `AGENTS.md` and `GEMINI.md`, in its home and in its config. */
export const antigravityInstructions = (home: string) =>
  [antigravityHome(home), antigravityConfig(home)].flatMap((folder) => [
    join(folder, 'AGENTS.md'),
    join(folder, 'GEMINI.md'),
  ]);

/** Its global folders of `.md` rules: its config's and its CLI's. */
export const antigravityRules = (home: string) => [
  join(antigravityConfig(home), 'rules'),
  join(antigravityCli(home), 'rules'),
];

/** Its global skills folder. */
export const antigravitySkills = (home: string) => join(antigravityCli(home), 'skills');

/** A project's own Antigravity files, relative to the project (it reads `.agents/skills` too). */
export const ANTIGRAVITY_PROJECT_INSTRUCTIONS = [
  'GEMINI.md',
  join('.agents', 'AGENTS.md'),
  join('.agents', 'GEMINI.md'),
];
export const ANTIGRAVITY_PROJECT_RULES = [join('.agents', 'rules'), join('.agent', 'rules')];
export const ANTIGRAVITY_PROJECT_SKILLS = join('.agent', 'skills');
