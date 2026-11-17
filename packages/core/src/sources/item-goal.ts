import { clip } from '../lib/clip.js';
import type { ImportListRow } from './import-service.js';
import type { ItemSource } from './items.js';

// The goal of a session started from an imported item (CONTEXT.md, Import): it points the agent
// at the item's vault files, read with `mesa vault read`, instead of pasting them.

const KIND: Record<ItemSource, string> = {
  jira: 'Jira issue',
  confluence: 'Confluence page',
  notion: 'Notion page',
  clickup: 'ClickUp item',
  linear: 'Linear item',
  github: 'GitHub issue',
  web: 'web page',
};

// ponytail: a title clipped this short keeps the built part far below the Goal's command limit
// (goal.ts); only the `extra` text can make it too long, which the start then refuses.
const MAX_TITLE = 200;

/**
 * The goal for `item`: its title (clipped, never its paths), its source URL, and the vault paths
 * of its note, if any, and its latest snapshot, for the agent to read with `mesa vault read`;
 * then `extra`, when given.
 */
export function itemGoal(item: ImportListRow, extra?: string): string {
  const files = [
    ...(item.note ? [`- Note: ${item.note}`] : []),
    `- Latest snapshot: ${item.snapshot}`,
  ];
  const lines = [
    `Work on the imported ${KIND[item.source]} ${clip(item.title, MAX_TITLE)}`,
    `Source: ${item.url}`,
    'Read these with mesa vault read <path> --json before you begin:',
    ...files,
  ];
  return extra?.trim() ? `${lines.join('\n')}\n\n${extra}` : lines.join('\n');
}
