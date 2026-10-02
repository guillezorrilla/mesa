import { existsSync } from 'node:fs';
import { obsidianDateTime } from '../lib/time.js';
import { listVault } from '../vault/inventory.js';
import { VAULT } from '../vault/layout.js';
import { type NotesDeps, oneLine, readNote, writeNote } from '../vault/notes.js';
import { vaultFile } from '../vault/scope.js';
import { ITEM_SOURCES } from './connectors.js';
import type { Item, ItemSource } from './items.js';

// An item's snapshots (CONTEXT.md, Import): each fetch is a new raw/<source>/<id>/<time>.md, its
// frontmatter the only record of what a project imported.

/** An imported item as its latest snapshot's frontmatter says it. */
export type SnapshotRow = {
  source: ItemSource;
  id: string;
  url: string;
  title: string;
  /** When it was fetched, YYYY-MM-DDTHH:mm local. */
  fetched: string;
  /** The snapshot's vault path. */
  snapshot: string;
};

/**
 * Writes a new snapshot of `item` for `project` at raw/<source>/<id>/<YYYY-MM-DDTHHmm>.md, with
 * `-2` and on for another fetch in the same minute, so an earlier snapshot is never changed. Its
 * frontmatter: `project`, `source`, `url`, `id`, `title`, and `fetched`. Its path.
 */
export function writeSnapshot(deps: NotesDeps, project: string, item: Item): string {
  const fetched = obsidianDateTime(deps.clock());
  const name = `${VAULT.raw}/${item.source}/${item.id}/${fetched.replace(':', '')}`;
  let path = `${name}.md`;
  for (let n = 2; existsSync(vaultFile(deps.vault, path)); n++) path = `${name}-${n}.md`;
  const title = oneLine(item.title);
  writeNote(
    deps,
    {
      path,
      frontmatter: { project, url: item.url, id: item.id, title, fetched },
      body: `# ${title}\n\n${item.markdown.trim()}\n`,
    },
    item.source,
  );
  return path;
}

/** A snapshot's order among its item's: its fetch time, then its same-minute number. */
const order = (row: SnapshotRow) =>
  `${row.fetched} ${(/-(\d+)\.md$/.exec(row.snapshot)?.[1] ?? '1').padStart(4, '0')}`;

/** Every item `project` imported, each with its latest snapshot, newest first. */
export function snapshotRows(vault: string, project: string): SnapshotRow[] {
  const latest = new Map<string, SnapshotRow>();
  for (const { path, kind } of listVault(vault, { project, type: VAULT.raw })) {
    if (kind !== 'markdown') continue;
    const { source, id, url, title, fetched } = readNote(vault, path).frontmatter;
    const known = ITEM_SOURCES.find((s) => s === source);
    if (!known || typeof id !== 'string' || typeof url !== 'string') continue;
    if (typeof fetched !== 'string') continue;
    const row = { source: known, id, url, title: String(title ?? id), fetched, snapshot: path };
    const seen = latest.get(`${known}/${id}`);
    if (!seen || order(row) > order(seen)) latest.set(`${known}/${id}`, row);
  }
  return [...latest.values()].sort(
    (a, b) => order(b).localeCompare(order(a)) || a.snapshot.localeCompare(b.snapshot),
  );
}
