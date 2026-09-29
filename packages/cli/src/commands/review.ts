import { defineCommand } from '../command.js';

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

const changeFlags = {
  path: { type: 'string', required: true, description: 'Selected changed file' },
  staged: { type: 'boolean', description: 'Review the staged diff instead of the working diff' },
  source: { type: 'string', required: true, description: 'Patch source from review changes' },
  revision: { type: 'string', required: true, description: 'Revision from review changes' },
  'selection-profile': {
    type: 'string',
    required: true,
    description: 'Profile from review changes',
  },
  hunk: { type: 'string', required: true, description: 'Selected hunk index' },
  comment: { type: 'string', required: true, description: 'Review comment' },
} as const;

export const reviewChanges = defineCommand({
  name: 'review changes',
  summary: 'Read a changed file and its selectable Git diff hunks for a session',
  args: ['session', 'path'],
  flags: { staged: changeFlags.staged },
  example: 'mesa review changes a1b2c3d4 src/app.ts',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.sessions.changes.read(args.session, args.path, flags.staged);
    return {
      data,
      text: data.hunks.length
        ? data.hunks.map((hunk) => `${hunk.index} ${hunk.header}`).join('\n')
        : 'No text hunks in this diff',
    };
  },
});

export const reviewChangePreview = defineCommand({
  name: 'review change-preview',
  summary: 'Preview feedback for an exact changed file and hunk',
  args: ['session'],
  flags: changeFlags,
  example:
    'mesa review change-preview a1b2c3d4 --path src/app.ts --source <sha256> --revision <sha256> --selection-profile default --hunk 0 --comment "Check this"',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.sessions.changes.preview(args.session, {
      profile: flags['selection-profile'],
      path: flags.path,
      staged: flags.staged ?? false,
      source: flags.source,
      revision: flags.revision,
      hunk: Number(flags.hunk),
      comment: flags.comment,
    });
    return { data, text: data.prompt };
  },
});

export const reviewChangeSend = defineCommand({
  name: 'review change-send',
  summary: 'Recheck and send changed-file feedback through the session guardrail',
  args: ['session'],
  flags: {
    ...changeFlags,
    yes: { type: 'boolean', description: 'Send past a guardrail ask after confirmation' },
    'no-from': { type: 'boolean', description: 'Send as a person, not another Mesa session' },
  },
  example:
    'mesa review change-send a1b2c3d4 --path src/app.ts --source <sha256> --revision <sha256> --selection-profile default --hunk 0 --comment "Check this"',
  run: async ({ mesa, args, flags, confirm }) => {
    const data = await mesa.sessions.changes.send(
      args.session,
      {
        profile: flags['selection-profile'],
        path: flags.path,
        staged: flags.staged ?? false,
        source: flags.source,
        revision: flags.revision,
        hunk: Number(flags.hunk),
        comment: flags.comment,
      },
      { yes: flags.yes, noFrom: flags['no-from'], confirm },
    );
    return {
      data,
      text: `${data.status} change review ${data.id.slice(0, 12)} to ${args.session}`,
    };
  },
});

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
    const data = await mesa.sessions.responses.send(
      args.session,
      {
        profile: flags['selection-profile'],
        source: flags.source,
        revision: flags.revision,
        start: Number(flags.start),
        end: Number(flags.end),
        comment: flags.comment,
      },
      {
        yes: flags.yes,
        noFrom: flags['no-from'],
        confirm,
      },
    );
    return {
      data,
      text: `${data.status} response review ${data.id.slice(0, 12)} to ${args.session}`,
    };
  },
});
