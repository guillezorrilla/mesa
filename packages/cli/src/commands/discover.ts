import { counted } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../guards.js';
import { columns } from '../output/columns.js';

export const discover = defineCommand({
  name: 'discover',
  summary:
    'List the project folders, running sessions, and recent Claude Code and Codex conversations on this machine that no profile has',
  flags: {
    days: { type: 'string', description: 'How many days back to look, 1 to 365 (default: 30)' },
  },
  example: 'mesa discover --days 7',
  run: async ({ mesa, flags }) => {
    const days = flags.days === undefined ? 30 : wholeNumber(flags.days, '--days');
    const found = await mesa.sessions.discover(days);
    const loose = found.conversations.filter((c) => c.project === null).length;
    const text = [
      ...columns(
        found.projects.map((p) => [
          p.name,
          p.path,
          `${counted(p.conversations, 'conversation')}${p.live ? `, ${p.live} running` : ''}`,
          p.registered ? '(registered)' : '',
        ]),
      ),
      ...columns(found.live.map((s) => ['running', s.name ?? s.id, s.agent, s.cwd])),
      loose ? `${counted(loose, 'conversation')} in no project folder` : '',
      found.truncated ? `showing newest ${found.conversations.length} of ${found.total}` : '',
    ].filter(Boolean);
    return {
      data: found,
      text: text.length ? text.join('\n') : `nothing found in the last ${counted(days, 'day')}`,
    };
  },
});
