import { MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';

export const logsSession = defineCommand({
  name: 'logs session',
  summary:
    'Start a session in a registered project (or general) that fixes a Cloud Logs error group, read as JSON on stdin, or carries an Ask conversation on (--conversation); its goal fences the log text as data and masks it, a prod group asks first, and the goal passes the guardrail',
  args: ['project'],
  flags: {
    conversation: {
      type: 'string',
      description: 'The Ask conversation to carry on (mesa logs asks)',
    },
    env: { type: 'string', description: 'The env the group was read in, for the prod check' },
    'allow-prod': {
      type: 'boolean',
      description: 'Confirm, once for the GCP project, a group read from prod',
    },
    yes: { type: 'boolean', description: "Answer the guardrail's ask on the goal" },
  },
  example: 'mesa logs session general --conversation run4bf92',
  run: async ({ mesa, args, flags, stdin }) => {
    let group: unknown;
    if (!flags.conversation) {
      try {
        group = JSON.parse(await stdin());
      } catch {
        throw new MesaError(
          'usage',
          'pipe an error group as JSON on stdin, or pass --conversation',
        );
      }
    }
    const done = await mesa.logs.session(
      args.project,
      { group, conversation: flags.conversation },
      { env: flags.env, allowProd: flags['allow-prod'], yes: flags.yes },
    );
    return { data: done, text: 'Started a session' };
  },
});
