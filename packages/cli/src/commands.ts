import { type Check, checkEnvironment, EXIT_CODES, isHealthy, profileDir } from '@mesa/core';
import type { Command } from './registry.js';

function doctorLine(c: Check): string {
  const mark = c.ok ? 'ok  ' : c.required ? 'FAIL' : 'warn';
  return `${mark}  ${c.name.padEnd(11)}  ${[c.version, c.path, c.hint].filter(Boolean).join('  ')}`;
}

// Every mesa subcommand is one entry here; help and flag parsing come from the registry.
export const COMMANDS: Command[] = [
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
    name: 'profile',
    summary: 'Show the active profile and its directory',
    run: ({ profile }) => ({ data: { profile, dir: profileDir(profile) }, text: profile }),
  },
];
