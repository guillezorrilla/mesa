import { EXIT_CODES } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

const MARK = { ok: 'ok', warn: 'warn', fail: 'FAIL' } as const;

export const doctor = defineCommand({
  name: 'doctor',
  summary:
    'Check tmux, the agents, Obsidian, the profile directory, the decision model, and both hooks',
  flags: {
    fix: {
      type: 'boolean',
      description: 'First stop the tmux servers of profiles that no longer exist, then check',
    },
  },
  example: 'mesa doctor',
  run: async ({ mesa, flags }) => {
    const stopped = flags.fix ? await mesa.stopLeftoverServers() : undefined;
    const report = await mesa.doctor();
    // Path and hint share the last column, which is never padded.
    const lines = columns(
      report.checks.map((c) => [
        MARK[c.status],
        c.name,
        c.version,
        [c.path, c.hint].filter(Boolean).join('  '),
      ]),
    );
    if (!report.healthy) lines.push(`doctor: ${report.summary}`);
    if (stopped) lines.unshift(`stopped ${stopped.length} tmux server(s) of deleted profiles`);
    return {
      data: stopped ? { ...report, stopped } : report,
      text: lines.join('\n'),
      code: report.healthy ? 0 : EXIT_CODES.not_found,
    };
  },
});

export const doctorInstall = defineCommand({
  name: 'doctor install',
  summary: 'Install a missing requirement that doctor offers to install, with Homebrew',
  args: ['name'],
  example: 'mesa doctor install tmux',
  run: async ({ mesa, args }) => {
    const data = await mesa.installRequirement(args.name);
    return { data, text: `installed ${data.name}` };
  },
});
