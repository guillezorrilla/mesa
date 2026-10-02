import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { LockedNotesDeps } from '../vault/notes.js';
import type { Site } from './connection.js';
import { CONNECTORS } from './connectors.js';
import { type NotesRun, type SkillRun, writeNotes } from './import-notes.js';
import type { Item, ItemRef, ItemSource } from './items.js';
import { resolveLink } from './links.js';
import { NOTES_MAX_ITEMS } from './notes-limit.js';
import { writeSnapshot } from './snapshots.js';
import { SOURCE_IDS, type SourceId } from './sources.js';

// The import pipeline (CONTEXT.md, Import): links resolved and fetched, each a new raw/ snapshot,
// then, unless notes are off, one import-notes run whose notes core lands. A refresh is the same
// import of the items' URLs.

/** What an import pipeline needs: the vault, plain and authorized HTTP, the sites, a Skill run. */
export type ImportDeps = {
  notes: LockedNotesDeps;
  /** Plain HTTP, for public web pages. */
  http: Http;
  /** Calls to a Source's API with its connection's token (authorizedFetch). */
  fetch: (source: SourceId) => Http;
  /** The sites a Source's connection reaches; none when it has no connection. */
  sites: (source: SourceId) => Promise<Site[] | undefined>;
  run: SkillRun;
};

/** One item an import brought in: its snapshot, and the note written for it, if any. */
export type ImportedItem = {
  source: ItemSource;
  id: string;
  title: string;
  url: string;
  snapshot: string;
  note?: string;
};

/** What an import did. */
export type ImportResult = {
  project: string;
  items: ImportedItem[];
  /** The Write notes run, absent with notes off: its session, and why it wrote no notes. */
  notes?: NotesRun;
  /** Notes left as they are, being locked. */
  locked?: string[];
};

/**
 * Imports `links` into `project`'s vault. Every link resolves and every item is fetched before
 * anything is written, so an unsupported or inaccessible link stops the import with nothing
 * written, as does one with notes of more than NOTES_MAX_ITEMS items. Each item then gets a new
 * snapshot, and with `notes` its note (writeNotes).
 */
export async function importLinks(
  deps: ImportDeps,
  project: string,
  links: readonly string[],
  notes: boolean,
): Promise<ImportResult> {
  const sites = await reachedSites(deps.sites);
  const refs = [
    ...new Map(links.map((link) => resolveLink(link, sites)).map((r) => [r.url, r])).values(),
  ];
  if (notes && refs.length > NOTES_MAX_ITEMS) {
    throw new MesaError(
      'usage',
      `Write notes takes at most ${NOTES_MAX_ITEMS} items in one import, and this one has ${refs.length}: import them in batches, or with Write notes off (--no-notes)`,
    );
  }
  // One authorized fetch per Source, so its token refreshes once; one item at a time.
  const gets = new Map<SourceId, Http>();
  const items: Item[] = [];
  for (const ref of refs) items.push(await fetchItem(deps, gets, ref));
  const snapshots = items.map((item) => ({
    item,
    snapshot: writeSnapshot(deps.notes, project, item),
  }));
  const result = (
    more: Omit<ImportResult, 'project' | 'items'> = {},
    written = new Map<string, string>(),
  ): ImportResult => ({
    project,
    items: snapshots.map(({ item, snapshot }): ImportedItem => {
      const note = written.get(item.url);
      const { source, id, title, url } = item;
      return { source, id, title, url, snapshot, ...(note ? { note } : {}) };
    }),
    ...more,
  });
  if (!notes) return result();
  const { written, ...outcome } = await writeNotes(deps, project, snapshots);
  return result(outcome, written);
}

/** The sites each Source's connection reaches, for resolveLink; none for one with no connection. */
export async function reachedSites(sites: ImportDeps['sites']) {
  const reached: Partial<Record<SourceId, Site[]>> = {};
  for (const source of SOURCE_IDS) {
    const found = await sites(source);
    if (found) reached[source] = found;
  }
  return reached;
}

/** One item, through its connector, over its Source's authorized fetch or plain HTTP. */
function fetchItem(deps: ImportDeps, gets: Map<SourceId, Http>, ref: ItemRef) {
  const { connection, fetch } = CONNECTORS[ref.source];
  if (!connection) return fetch(deps.http, ref);
  const get = gets.get(connection) ?? deps.fetch(connection);
  gets.set(connection, get);
  return fetch(get, ref);
}
