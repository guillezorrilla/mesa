import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

export const filesWrite = defineCommand({
  name: 'files write',
  summary: 'Save text only when its read revision is current',
  args: ['project', 'path'],
  flags: {
    checkout: CHECKOUT_FLAG,
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
  flags: { checkout: CHECKOUT_FLAG, text: { type: 'string', description: 'Initial UTF-8 text' } },
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
    checkout: CHECKOUT_FLAG,
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
    checkout: CHECKOUT_FLAG,
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
