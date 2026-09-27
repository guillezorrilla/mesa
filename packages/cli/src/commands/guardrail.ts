import { defineCommand } from '../command.js';

/** The guardrail's verdict on a text, for the app and for tests: it changes nothing. */
export const guardrailCheck = defineCommand({
  name: 'guardrail check',
  summary:
    'Print the guardrail verdict (allow, ask, block) on a text, why, and the decision; no receipt',
  args: ['text'],
  flags: {
    project: {
      type: 'string',
      description: "The project whose guardrail level counts (mesa.yaml's guardrail)",
    },
  },
  example: 'mesa guardrail check "git push --force origin main" --project lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const check = await mesa.guardrail.check(args.text, flags.project);
    return { data: check, text: `${check.verdict}: ${check.reason}` };
  },
});
