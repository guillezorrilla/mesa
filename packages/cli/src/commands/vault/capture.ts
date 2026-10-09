import { EXIT_CODES } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { recordedOutput } from '../../output/recorded.js';

export const vaultCapture = defineCommand({
  name: 'vault capture',
  summary:
    "Capture a session's durable decisions and findings into the vault now: one vault-capture run over its conversation, waited for, then the notes it saved; exits 1 when it saved none because it failed",
  args: ['session'],
  example: 'mesa vault capture a1b2c3d4',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.vault.capture(args.session);
    const { ok, notes, reason, run } = recorded.result;
    const text = !ok
      ? `capture failed (${reason}): run ${run}`
      : notes.length
        ? notes.map((note) => `saved ${note}`).join('\n')
        : `nothing to save: run ${run}`;
    return {
      ...recordedOutput(recorded, { data: recorded.result, text }),
      code: ok ? 0 : EXIT_CODES.internal,
    };
  },
});
