import { EXIT_CODES, type ImportResult, type Recorded } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

const project = {
  type: 'string',
  required: true,
  description: 'The registered project whose vault the items go in',
} as const;
const noNotes = {
  type: 'boolean',
  description: 'Write only the raw/ snapshots: no import-notes run, no agent',
} as const;

/** An import's output: a line per item, then how Write notes went; exits 1 when it wrote none. */
function imported(recorded: Recorded<ImportResult>) {
  const { items, notes, locked } = recorded.result;
  const lines = columns(items.map((i) => [i.source, i.id, i.title, i.snapshot, i.note]));
  if (notes) lines.push(notes.ok ? 'notes written' : `notes not written (${notes.reason})`);
  if (locked?.length) lines.push(`locked, left as they are: ${locked.join(', ')}`);
  if (recorded.result.checked)
    lines.push(
      `checked ${recorded.result.checked.length}, skipped ${recorded.result.skipped?.length}, refreshed ${recorded.result.refreshed?.length}`,
    );
  const out = recordedOutput(recorded, { data: recorded.result, text: lines.join('\n') });
  return { ...out, code: notes && !notes.ok ? EXIT_CODES.internal : 0 };
}

export const importLinks = defineCommand({
  name: 'import',
  summary:
    "Import Jira issues (a URL or a key), Confluence pages, Notion pages and database rows, and public web pages into a project's vault: a raw/ snapshot each, then one import-notes run that writes a wiki/ note per item, linked from the project hub; exits 1 when the notes were not written",
  args: ['links...'],
  flags: { project, 'no-notes': noNotes },
  example: 'mesa import https://lantern-cove.atlassian.net/browse/LC-12 --project lantern-cove',
  run: async ({ mesa, args, flags }) =>
    imported(await mesa.imports.add(flags.project, args.links, !flags['no-notes'])),
});

export const importList = defineCommand({
  name: 'import list',
  summary:
    "List a project's imported items from its vault's raw/ snapshots: each one's latest fetch and its note",
  flags: { project },
  example: 'mesa import list --project lantern-cove',
  run: ({ mesa, flags }) => {
    const data = mesa.imports.list(flags.project);
    const rows = data.items.map((i) => [i.source, i.id, i.title, i.fetched, i.note ?? '-']);
    return { data, text: columns(rows).join('\n') };
  },
});

export const importRefresh = defineCommand({
  name: 'import refresh',
  summary:
    "Import a project's items again (the ids given, else all): a new snapshot each, and their notes updated, keeping their <!-- keep --> blocks",
  args: ['ids...'],
  flags: {
    project,
    'no-notes': noNotes,
    'changed-only': {
      type: 'boolean',
      description:
        'Check revisions, skip unchanged items, and write changed notes in batches of 50 using Claude',
    },
  },
  example: 'mesa import refresh LC-12 --project lantern-cove',
  run: async ({ mesa, args, flags }) =>
    imported(
      await mesa.imports.refresh(flags.project, args.ids, !flags['no-notes'], {
        changedOnly: flags['changed-only'],
      }),
    ),
});

export const importGoal = defineCommand({
  name: 'import goal',
  summary:
    "Print the goal a session started from an imported item gets (mesa open --from), without starting it: the item's title, URL, and vault paths",
  args: ['item'],
  flags: { project },
  example: 'mesa import goal LC-12 --project lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.imports.goal(flags.project, args.item);
    return { data, text: data.goal };
  },
});
