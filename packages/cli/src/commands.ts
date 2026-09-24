import { resolve } from 'node:path';
import {
  type Check,
  checkEnvironment,
  EXIT_CODES,
  initProfile,
  isHealthy,
  loadConfig,
  MesaError,
  profileDir,
  redactConfig,
  setConfigValue,
} from '@mesa/core';
import { stringify } from 'yaml';
import type { Command } from './registry.js';

function doctorLine(c: Check): string {
  const mark = c.ok ? 'ok  ' : c.required ? 'FAIL' : 'warn';
  return `${mark}  ${c.name.padEnd(11)}  ${[c.version, c.path, c.hint].filter(Boolean).join('  ')}`;
}

// Every mesa subcommand is one entry here; help and flag parsing come from the registry.
export const COMMANDS: Command[] = [
  {
    name: 'config',
    summary: 'Print the profile config (keys redacted), or `config set <path> <value>`',
    run: ({ profile, args }) => {
      const dir = profileDir(profile);
      if (args.length === 0) {
        const config = redactConfig(loadConfig(dir));
        return { data: config, text: stringify(config).trimEnd() };
      }
      const [verb, path, value, ...rest] = args;
      if (verb !== 'set' || !path || value === undefined || rest.length) {
        throw new MesaError('usage', 'Usage: mesa config set <path> <value>');
      }
      const next = setConfigValue(dir, path, value);
      return { data: { path, value: next }, text: `${path} = ${JSON.stringify(next)}` };
    },
  },
  {
    name: 'doctor',
    summary: 'Check tmux, the agents, Obsidian, and the profile directory',
    run: async ({ profile }) => {
      const checks = await checkEnvironment({ profileDir: profileDir(profile) });
      const healthy = isHealthy(checks);
      const lines = checks.map(doctorLine);
      if (!healthy)
        lines.push('doctor: tmux and at least one agent (claude or codex) are required');
      return { data: checks, text: lines.join('\n'), code: healthy ? 0 : EXIT_CODES.not_found };
    },
  },
  {
    name: 'init',
    summary: 'Create the profile directory and its config.yaml',
    flags: {
      vault: {
        type: 'string',
        description: 'Absolute path of the vault this profile owns (required)',
      },
      agent: { type: 'string', description: 'Default agent: claude (default) or codex' },
    },
    run: ({ profile, flags }) => {
      if (typeof flags.vault !== 'string')
        throw new MesaError('usage', 'mesa init needs --vault <path>');
      const dir = profileDir(profile);
      const { created, path } = initProfile({
        dir,
        vault: resolve(flags.vault),
        agent: flags.agent as string | undefined,
      });
      const text = created
        ? `initialised profile ${profile} at ${path}`
        : `profile ${profile} already initialised`;
      return { data: { profile, dir, created }, text };
    },
  },
  {
    name: 'profile',
    summary: 'Show the active profile and its directory',
    run: ({ profile }) => ({ data: { profile, dir: profileDir(profile) }, text: profile }),
  },
];
