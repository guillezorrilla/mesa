import type { Http } from '../lib/http.js';
import { MesaError, toFail } from '../lib/result.js';
import type { HeadlessResult } from '../sessions/run.js';
import type { LockedNotesDeps } from '../vault/notes.js';
import type { Site } from './connection.js';
import { CONNECTORS } from './connectors.js';
import { IMPORT_NOTES, landNotes, notesArgs, notesOf, planNotes } from './import-notes.js';
import type { Item, ItemRef, ItemSource } from './items.js';
import { resolveLink } from './links.js';
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
  /** A Skill run on the project, waited for (the sessions service's run). */
  run: (
    skill: string,
    opts: { project: string; args: string[]; yes: boolean },
  ) => Promise<{ result: HeadlessResult & { session: string } }>;
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
  notes?: { ok: boolean; session?: string; reason?: string };
  /** Notes left as they are, being locked. */
  locked?: string[];
};

/**
 * Imports `links` into `project`'s vault. Every link resolves and every item is fetched before
 * anything is written, so an unsupported or inaccessible link stops the import with nothing
 * written. Each item then gets a new snapshot. With `notes`, one import-notes run writes a note
 * per item, which core lands; a run that fails, or whose output does not land, leaves the
 * snapshots and changes no note, and says why in `notes`.
 */
export async function importLinks(
  deps: ImportDeps,
  project: string,
  links: readonly string[],
  notes: boolean,
): Promise<ImportResult> {
  const sites: Partial<Record<SourceId, Site[]>> = {};
  for (const source of SOURCE_IDS) {
    const reached = await deps.sites(source);
    if (reached) sites[source] = reached;
  }
  const refs = [
    ...new Map(links.map((link) => resolveLink(link, sites)).map((r) => [r.url, r])).values(),
  ];
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
  const { planned, locked } = planNotes(deps.notes.vault, project, snapshots);
  const extra = locked.length ? { locked } : {};
  if (!planned.length) return result({ notes: { ok: true }, ...extra });
  let session: string | undefined;
  try {
    const { result: ran } = await deps.run(IMPORT_NOTES, {
      project,
      args: notesArgs(planned),
      yes: true,
    });
    session = ran.session;
    if (!ran.ok) throw new MesaError('internal', ran.reason ?? `the ${IMPORT_NOTES} run failed`);
    await landNotes(deps.notes, project, planned, notesOf(ran.output, planned));
    const written = new Map(planned.map((p) => [p.item.url, p.path]));
    return result({ notes: { ok: true, session }, ...extra }, written);
  } catch (error) {
    const reason = toFail(error).error.message;
    return result({ notes: { ok: false, ...(session ? { session } : {}), reason }, ...extra });
  }
}

/** One item, through its connector, over its Source's authorized fetch or plain HTTP. */
function fetchItem(deps: ImportDeps, gets: Map<SourceId, Http>, ref: ItemRef) {
  const { connection, fetch } = CONNECTORS[ref.source];
  if (!connection) return fetch(deps.http, ref);
  const get = gets.get(connection) ?? deps.fetch(connection);
  gets.set(connection, get);
  return fetch(get, ref);
}
