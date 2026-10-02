import type { SourceRow } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

/** One source's line: its id, status, account, and sites. */
const line = (row: SourceRow) => [
  row.id,
  row.status,
  row.account?.name,
  row.sites?.map((site) => site.name).join(', '),
];

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
