import { VAULT } from '../layout.js';
import { readNote } from '../notes.js';
import { searchVault } from '../search.js';
import type { CaptureItem } from './items.js';

// Which note already covers a captured item (CONTEXT.md, Vault capture): only one of exactly the
// same title, so a related note on another point is never written over.

/**
 * The note in `project` that covers `item`, if any: one under wiki/ of the item's type (`decision`
 * or `note`), Mesa's and not locked (a person's note is never one a capture updates), whose title
 * (its heading, else its file name) is the item's, case aside.
 */
export function coveringNote(vault: string, project: string, item: CaptureItem) {
  const title = item.title.toLocaleLowerCase();
  // Every word of a same-titled note's title is in its heading or path, so search finds it.
  const { items } = searchVault(vault, item.title, {
    project,
    type: VAULT.wiki,
    limit: Number.MAX_SAFE_INTEGER,
  });
  for (const hit of items) {
    if (hit.kind !== 'markdown') continue;
    const { frontmatter, body } = readNote(vault, hit.path);
    if (frontmatter.type !== item.kind || frontmatter.source !== 'mesa' || frontmatter.locked)
      continue;
    const heading = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? hit.title;
    if (heading.toLocaleLowerCase() === title) return hit.path;
  }
  return undefined;
}
