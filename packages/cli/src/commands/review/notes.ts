import type { NoteScope } from '@mesa/core';
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
        'branch (default: the Session diff against its base), working (unstaged) or staged',
    },
  },
  example: 'mesa review notes add a1b2c3d4 --path src/app.ts --line 3 --end 5 --text "rename"',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.sessions.notes.add(args.session, {
      path: flags.path,
      line: Number(flags.line),
      ...(flags.end === undefined ? {} : { end: Number(flags.end) }),
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
