import type { Frontmatter } from '../frontmatter.js';
import { VAULT } from '../layout.js';
import { readNote } from '../notes.js';
import { existingNote } from '../saved-notes.js';
import { searchVault } from '../search.js';
import type { CaptureItem } from './items.js';

// Which note already covers a captured item (CONTEXT.md, Vault capture): the note it names to
// update, when its own session saved that one, else only one of exactly the same title, so a
// related note on another point, or another session's, is never written over by a pick.

/** Whether a note of frontmatter `f` is one a capture of `item` may update: Mesa's, unlocked, its type. */
const updatable = (f: Frontmatter, item: CaptureItem) =>
  f.source === 'mesa' && !f.locked && f.type === item.kind;

/**
 * The path of the note `item.updates` names, when `item` may replace it: under wiki/ in `project`'s scope, of
 * the item's type and project, Mesa's, not locked, and saved by `session` itself. Else none.
 * shortcut: a resumed session's own notes carry the session it resumed; walk resumedFrom if that
 * shows up as duplicates.
 */
function ownPath(vault: string, project: string, item: CaptureItem, session: string) {
  const path = item.updates?.replace(/(\.md)?$/, '.md');
  if (!path?.startsWith(`${VAULT.wiki}/`)) return undefined;
  let f: Frontmatter | undefined;
  try {
    f = existingNote(vault, path, project)?.frontmatter;
  } catch {
    return undefined; // Outside the project's scope, or not a note: matched by title instead.
  }
  return f && updatable(f, item) && f.session === session && f.project === project
    ? path
    : undefined;
}

/**
 * The note in `project` that covers `item`, captured from `session`, if any: the one it names to
 * update when its session saved it (ownPath), else one under wiki/ of the item's type (`decision`
 * or `note`), Mesa's and not locked (a person's note is never one a capture updates), whose title
 * (its heading, else its file name) is the item's, case aside.
 */
export function coveringNote(vault: string, project: string, item: CaptureItem, session: string) {
  const own = ownPath(vault, project, item, session);
  if (own) return own;
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
    if (!updatable(frontmatter, item)) continue;
    const heading = /^# (.+)$/m.exec(body)?.[1]?.trim() ?? hit.title;
    if (heading.toLocaleLowerCase() === title) return hit.path;
  }
  return undefined;
}
