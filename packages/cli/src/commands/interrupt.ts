import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

/** Stops a Structured session's agent mid-turn, as Esc does in a terminal (ADR-0029). */
export const interrupt = defineCommand({
  name: 'interrupt',
  summary:
    "Stop a Structured session's agent mid-turn, as Esc does in its terminal; the session stays open for the next message",
  args: ['session'],
  example: 'mesa interrupt a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sessions.interrupt(args.session);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `Interrupted ${args.session}'s agent`,
    });
  },
});
