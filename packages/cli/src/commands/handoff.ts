import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const handoff = defineCommand({
  name: 'handoff',
  summary:
    "Continue a session's work in a successor with its goal and a handoff note, then stop the session",
  args: ['session'],
  flags: {
    note: {
      type: 'string',
      required: true,
      description: 'The handoff note (a file): what is verified, assumed, left out, and blocked',
    },
    keep: {
      type: 'boolean',
      description: 'Leave the session running (not one in its own worktree)',
    },
    agent: { type: 'string', description: 'Target agent: claude, codex, or antigravity' },
  },
  example: 'mesa handoff $MESA_SESSION_ID --note handoff.md',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.handoff(args.session, {
      note: flags.note,
      keep: flags.keep ?? false,
      agent: flags.agent,
    });
    const { from, to, note, stop } = recorded.result;
    const stopped =
      stop === 'kept'
        ? `${from.id} keeps running`
        : stop === 'later'
          ? `${from.id} stops in a moment`
          : `${from.id} stopped (${stop})`;
    return recordedOutput(recorded, {
      data: { from: from.id, to: to.id, note },
      text: `handed off ${from.id} to ${to.id}, note at ${note}; ${stopped}`,
    });
  },
});
