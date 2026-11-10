import { MesaError, type NoteScope } from '@mesa/core';
import { defineCommand } from '../../command.js';

const where = (n: { path: string; line: number; end: number }) =>
  n.line === 0 ? n.path : `${n.path}:${n.line}${n.end > n.line ? `-${n.end}` : ''}`;

export const reviewNotes = defineCommand({
  name: 'review notes',
  summary: "List a session's review notes, each with the lines it quotes and whether they changed",
  args: ['session'],
  example: 'mesa review notes a1b2c3d4',
  run: async ({ mesa, args }) => {
    const data = await mesa.sessions.notes.list(args.session);
    return {
      data,
      text: data.length
        ? data
            .map(
              (n) =>
                `${n.id} ${where(n)}${n.stale ? ' (stale)' : ''}${n.sentAt ? ' (sent)' : ''} ${n.text.split('\n')[0]}`,
            )
            .join('\n')
        : 'No review notes',
    };
  },
});

export const reviewNotesAdd = defineCommand({
  name: 'review notes add',
  summary: "Keep a note on exact lines of a session's diff, as a draft until it is sent",
  args: ['session'],
  flags: {
    path: { type: 'string', required: true, description: 'The changed file' },
    line: {
      type: 'string',
      required: true,
      description: "First line on the diff's new side; 0 for a note on the whole file",
    },
    end: { type: 'string', description: 'Last line of a range (default: line)' },
    text: { type: 'string', required: true, description: 'The note' },
    scope: {
      type: 'string',
      description:
        'branch (default: the Session diff against its base), working (the working tree) or staged (the index)',
    },
  },
  example: 'mesa review notes add a1b2c3d4 --path src/app.ts --line 3 --end 5 --text "rename"',
  run: async ({ mesa, args, flags }) => {
    const whole = (flag: string, value: string) => {
      if (!/^\d+$/.test(value)) throw new MesaError('usage', `--${flag} must be a whole number`);
      return Number(value);
    };
    const data = await mesa.sessions.notes.add(args.session, {
      path: flags.path,
      line: whole('line', flags.line),
      ...(flags.end === undefined ? {} : { end: whole('end', flags.end) }),
      text: flags.text,
      ...(flags.scope ? { scope: flags.scope as NoteScope } : {}),
    });
    return { data, text: `Noted ${where(data)} as ${data.id}` };
  },
});

export const reviewNotesEdit = defineCommand({
  name: 'review notes edit',
  summary: "Change a review note's text; a sent note is unsent again",
  args: ['session', 'id'],
  flags: { text: { type: 'string', required: true, description: 'The new text' } },
  example: 'mesa review notes edit a1b2c3d4 k7m2p9qx --text "rename it tideLevel"',
  run: ({ mesa, args, flags }) => {
    const data = mesa.sessions.notes.edit(args.session, args.id, flags.text);
    return { data, text: `Edited ${data.id}` };
  },
});

export const reviewNotesRemove = defineCommand({
  name: 'review notes remove',
  summary: 'Delete a review note',
  args: ['session', 'id'],
  example: 'mesa review notes remove a1b2c3d4 k7m2p9qx',
  run: ({ mesa, args }) => {
    const data = mesa.sessions.notes.remove(args.session, args.id);
    return { data, text: `Removed ${data.id}` };
  },
});

export const reviewNotesSend = defineCommand({
  name: 'review notes send',
  summary:
    "Send a session's unsent review notes, or one file's, to its agent as one prompt through the guardrail",
  args: ['session'],
  flags: {
    path: { type: 'string', description: "Send only this file's notes" },
    yes: { type: 'boolean', description: 'Send past a guardrail ask after confirmation' },
    'no-from': { type: 'boolean', description: 'Send as a person, not another Mesa session' },
  },
  example: 'mesa review notes send a1b2c3d4 --path src/app.ts',
  run: async ({ mesa, args, flags, confirm }) => {
    const data = await mesa.sessions.notes.send(args.session, flags.path, {
      yes: flags.yes,
      noFrom: flags['no-from'],
      confirm,
    });
    const left = data.stale.length
      ? `; left ${data.stale.length} stale: ${data.stale.join(' ')}`
      : '';
    const what = !data.delivery
      ? 'No unsent notes to send'
      : data.sent.length
        ? `${data.delivery.already ? 'Already sent' : 'Sent'} ${data.sent.length} notes to ${args.session}`
        : `${data.delivery.status}: ${data.delivery.reason ?? 'nothing marked sent'}`;
    const warning = data.delivery?.warning ? `\n${data.delivery.warning}` : '';
    return { data, text: `${what}${left}${warning}` };
  },
});

export const reviewNotesResolve = defineCommand({
  name: 'review notes resolve',
  summary: 'Hide a review note from the list once its re-review is done',
  args: ['session', 'id'],
  example: 'mesa review notes resolve a1b2c3d4 k7m2p9qx',
  run: ({ mesa, args }) => {
    const data = mesa.sessions.notes.resolve(args.session, args.id);
    return { data, text: `Resolved ${data.id}` };
  },
});

export const reviewNotesClear = defineCommand({
  name: 'review notes clear',
  summary: "Delete a session's sent review notes whose lines have not changed since",
  args: ['session'],
  example: 'mesa review notes clear a1b2c3d4',
  run: async ({ mesa, args }) => {
    const data = await mesa.sessions.notes.clearSent(args.session);
    return { data, text: `Cleared ${data.removed.length} sent notes` };
  },
});
