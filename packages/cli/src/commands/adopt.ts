import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const adopt = defineCommand({
  name: 'adopt',
  summary: 'Import a Claude Code or Codex conversation and reopen it in a Mesa window',
  args: ['agentSessionId'],
  flags: {
    project: {
      type: 'string',
      description: 'The project, when no registered project holds the folder it ran in',
    },
    name: { type: 'string', description: 'What to call the session' },
    'no-resume': { type: 'boolean', description: 'Only record it; mesa resume opens it later' },
  },
  example: 'mesa adopt 36c173f2-803e-4845-bd97-a032b37c6d6d --project lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.sessions.adopt(args.agentSessionId, {
      project: flags.project,
      name: flags.name,
      noResume: flags['no-resume'],
    });
    const { record } = recorded.result;
    const done = flags['no-resume'] ? 'recorded' : 'resumed in its window';
    const text = `${record.id}: adopted on ${record.project}, ${done}`;
    return recordedOutput(recorded, { data: record, text });
  },
});
