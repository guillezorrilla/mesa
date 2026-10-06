import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';

export const filesTree = defineCommand({
  name: 'files tree',
  summary: 'List a bounded repository file tree',
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG },
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
    checkout: CHECKOUT_FLAG,
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
