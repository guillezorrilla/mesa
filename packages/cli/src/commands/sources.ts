import { DESCENDANTS_CAP, type SourceRow, siteNames } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

/** One source's line: its id, status, account, and sites. */
const line = (row: SourceRow) => [row.id, row.status, row.account?.name, siteNames(row)];

export const sourcesConnect = defineCommand({
  name: 'sources connect',
  summary: 'Sign in to a source in the browser through the broker; its token goes in the Keychain',
  args: ['source'],
  example: 'mesa sources connect atlassian',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sources.connect(args.source);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: columns([line(recorded.result)]).join('\n'),
    });
  },
});

export const sourcesList = defineCommand({
  name: 'sources list',
  summary: 'List the sources, each with its connection status, account, and sites',
  example: 'mesa sources list',
  run: async ({ mesa }) => {
    const data = await mesa.sources.list();
    return { data, text: columns(data.sources.map(line)).join('\n') };
  },
});

export const sourcesDisconnect = defineCommand({
  name: 'sources disconnect',
  summary: "Remove a source's token from the Keychain",
  args: ['source'],
  example: 'mesa sources disconnect atlassian',
  run: async ({ mesa, args }) => {
    const recorded = await mesa.sources.disconnect(args.source);
    return recordedOutput(recorded, {
      data: recorded.result,
      text: recorded.result.removed
        ? `disconnected ${args.source}`
        : `${args.source} was not connected`,
    });
  },
});

export const sourcesBrowse = defineCommand({
  name: 'sources browse',
  summary:
    "List a node's children in a source's tree, the sites when none is given: pages and issues with the URL mesa import takes, and the containers to browse into; --search looks under the node",
  args: ['source', 'node?'],
  flags: {
    cursor: {
      type: 'string',
      description: 'The next page of children: the cursor the last page printed',
    },
    search: {
      type: 'string',
      description: 'Find pages by title and issues by text under the node',
    },
    descendants: {
      type: 'boolean',
      description: `Every node under it instead, children's children too, up to ${DESCENDANTS_CAP}`,
    },
  },
  example: 'mesa sources browse atlassian confluence:<cloud-id>',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.sources.browse(args.source, args.node, {
      ...(flags.cursor ? { cursor: flags.cursor } : {}),
      ...(flags.search ? { search: flags.search } : {}),
      ...(flags.descendants ? { descendants: true } : {}),
    });
    const lines = columns(data.children.map((c) => [c.kind, c.title, c.id, c.url]));
    if (data.cursor) lines.push(`more: --cursor ${data.cursor}`);
    if (data.capped) lines.push(`stopped at ${DESCENDANTS_CAP}`);
    return { data, text: lines.join('\n') };
  },
});
