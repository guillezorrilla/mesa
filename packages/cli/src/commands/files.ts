import { MesaError } from '@mesa/core';
import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

const checkout = { type: 'string' as const, description: 'Select a linked worktree path' };

export const filesTree = defineCommand({
  name: 'files tree',
  summary: 'List a bounded repository file tree',
  args: ['project'],
  flags: { checkout },
  example: 'mesa files tree lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.files.tree(args.project, flags.checkout);
    return {
      data,
      text:
        data.entries
          .map(
            (entry) =>
              `${'  '.repeat(entry.depth)}${entry.path}${entry.kind === 'directory' ? '/' : ''}`,
          )
          .join('\n') || 'no files',
    };
  },
});

export const filesSearch = defineCommand({
  name: 'files search',
  summary: 'Search filenames or UTF-8 file contents',
  args: ['project', 'query'],
  flags: {
    checkout,
    content: { type: 'boolean', description: 'Search text content instead of names' },
  },
  example: 'mesa files search lantern-cove readme',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.files.search(
      args.project,
      args.query,
      flags.content ? 'content' : 'name',
      flags.checkout,
    );
    return {
      data,
      text:
        data.hits.map((hit) => `${hit.path}:${hit.line}: ${hit.preview}`).join('\n') ||
        'no matches',
    };
  },
});

export const filesRead = defineCommand({
  name: 'files read',
  summary: 'Read a UTF-8 file with its revision',
  args: ['project', 'path'],
  flags: { checkout, line: { type: 'string', description: 'Exact one-based line target' } },
  example: 'mesa files read lantern-cove README.md --line 1',
  run: async ({ mesa, args, flags }) => {
    const line = flags.line === undefined ? undefined : Number(flags.line);
    if (line !== undefined && (!Number.isSafeInteger(line) || line < 1))
      throw new MesaError('usage', 'line must be a positive integer');
    const data = await mesa.files.read(args.project, args.path, flags.checkout, line);
    return { data, text: data.text };
  },
});

export const filesOpen = defineCommand({
  name: 'files open',
  summary: 'Open a checked file in the configured external editor',
  args: ['project', 'path'],
  flags: { checkout, line: { type: 'string', description: 'Exact one-based line target' } },
  example: 'mesa files open lantern-cove README.md --line 1',
  run: async ({ mesa, args, flags }) => {
    const line = flags.line === undefined ? undefined : Number(flags.line);
    if (line !== undefined && (!Number.isSafeInteger(line) || line < 1))
      throw new MesaError('usage', 'line must be a positive integer');
    const recorded = await mesa.files.open(args.project, args.path, flags.checkout, line);
    return recordedOutput(recorded, { data: recorded.result, text: `opened ${args.path}` });
  },
});

export const filesLink = defineCommand({
  name: 'files link',
  summary: 'Resolve a managed session terminal file link',
  args: ['session', 'target'],
  example: 'mesa files link aaaaaaaa src/main.ts:42',
  run: async ({ mesa, args }) => {
    const data = await mesa.files.link(args.session, args.target);
    return { data, text: `${data.project}: ${data.path}:${data.line}` };
  },
});

export const filesWrite = defineCommand({
  name: 'files write',
  summary: 'Save text only when its read revision is current',
  args: ['project', 'path'],
  flags: {
    checkout,
    text: { type: 'string', required: true, description: 'New UTF-8 text' },
    revision: { type: 'string', required: true, description: 'Revision from files read' },
  },
  example: 'mesa files write lantern-cove README.md --text "New text" --revision <sha256>',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.files.write(
      args.project,
      args.path,
      flags.text,
      flags.revision,
      flags.checkout,
    );
    return recordedOutput(recorded, { data: recorded.result, text: `saved ${args.path}` });
  },
});

export const filesCreate = defineCommand({
  name: 'files create',
  summary: 'Create a file without replacing an existing one',
  args: ['project', 'path'],
  flags: { checkout, text: { type: 'string', description: 'Initial UTF-8 text' } },
  example: 'mesa files create lantern-cove notes.md',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.files.create(
      args.project,
      args.path,
      flags.text ?? '',
      flags.checkout,
    );
    return recordedOutput(recorded, { data: recorded.result, text: `created ${args.path}` });
  },
});

export const filesRename = defineCommand({
  name: 'files rename',
  summary: 'Rename a file without replacing another',
  args: ['project', 'from', 'path'],
  flags: {
    checkout,
    revision: { type: 'string', required: true, description: 'Revision from files read' },
  },
  example: 'mesa files rename lantern-cove old.md new.md --revision <sha256>',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.files.rename(
      args.project,
      args.from,
      args.path,
      flags.revision,
      flags.checkout,
    );
    return recordedOutput(recorded, {
      data: recorded.result,
      text: `renamed ${args.from} to ${args.path}`,
    });
  },
});

export const filesDelete = defineCommand({
  name: 'files delete',
  summary: 'Delete exactly one current-revision file',
  args: ['project', 'path'],
  flags: {
    checkout,
    revision: { type: 'string', required: true, description: 'Revision from files read' },
  },
  example: 'mesa files delete lantern-cove notes.md --revision <sha256>',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.files.delete(
      args.project,
      args.path,
      flags.revision,
      flags.checkout,
    );
    return recordedOutput(recorded, { data: recorded.result, text: `deleted ${args.path}` });
  },
});
