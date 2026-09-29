import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const passageFlags = {
  source: { type: 'string', required: true, description: 'Source from review responses' },
  revision: { type: 'string', required: true, description: 'Revision from review responses' },
  'selection-profile': {
    type: 'string',
    required: true,
    description: 'Profile from review responses',
  },
  start: { type: 'string', required: true, description: 'Selected passage start offset' },
  end: { type: 'string', required: true, description: 'Selected passage end offset' },
  comment: { type: 'string', required: true, description: 'Review comment' },
} as const;

export const reviewResponses = defineCommand({
  name: 'review responses',
  summary: 'List recent native assistant responses for a managed session',
  args: ['session'],
  example: 'mesa review responses a1b2c3d4',
  run: ({ mesa, args }) => {
    const data = mesa.sessions.responses.list(args.session);
    return {
      data,
      text:
        data.unavailable ??
        (data.rows.length
          ? data.rows
              .map((row) => `${row.source.slice(0, 12)} ${row.text.split('\n')[0]}`)
              .join('\n')
          : 'No responses yet'),
    };
  },
});

export const reviewPreview = defineCommand({
  name: 'review preview',
  summary: 'Preview feedback for an exact native response passage',
  args: ['session'],
  flags: passageFlags,
  example:
    'mesa review preview a1b2c3d4 --source <sha256> --revision <sha256> --selection-profile default --start 0 --end 10 --comment "Clarify this"',
  run: ({ mesa, args, flags }) => {
    const data = mesa.sessions.responses.preview(args.session, {
      profile: flags['selection-profile'],
      source: flags.source,
      revision: flags.revision,
      start: Number(flags.start),
      end: Number(flags.end),
      comment: flags.comment,
    });
    return { data, text: data.prompt };
  },
});

export const reviewSend = defineCommand({
  name: 'review send',
  summary: 'Recheck and send response feedback through the session guardrail',
  args: ['session'],
  flags: {
    ...passageFlags,
    yes: { type: 'boolean', description: 'Send past a guardrail ask after confirmation' },
    'no-from': { type: 'boolean', description: 'Send as a person, not another Mesa session' },
  },
  example:
    'mesa review send a1b2c3d4 --source <sha256> --revision <sha256> --selection-profile default --start 0 --end 10 --comment "Clarify this"',
  run: async ({ mesa, args, flags, confirm }) => {
    const preview = mesa.sessions.responses.preview(args.session, {
      profile: flags['selection-profile'],
      source: flags.source,
      revision: flags.revision,
      start: Number(flags.start),
      end: Number(flags.end),
      comment: flags.comment,
    });
    const recorded = await mesa.sessions.send(args.session, preview.prompt, {
      yes: flags.yes,
      noFrom: flags['no-from'],
      confirm,
    });
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `sent response review to ${args.session}`,
    });
  },
});
