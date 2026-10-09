import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { SessionRecord } from '../sessions/record/record.js';
import type { LockedNotesDeps } from '../vault/notes.js';
import type { Site } from './connection.js';
import { CONNECTORS } from './connectors.js';
import { type NotesRun, type SkillRun, writeNotes } from './import-notes.js';
import type { ImportStep } from './import-progress.js';
import type { Item, ItemRef, ItemSource } from './items.js';
import { resolveLink } from './links.js';
import { NOTES_MAX_ITEMS } from './notes-limit.js';
import type { pendingImportNotes } from './pending-notes.js';
import { snapshotRows, writeSnapshot } from './snapshots.js';
import { SOURCE_IDS, type SourceId } from './sources.js';

// The import pipeline (CONTEXT.md, Import): links resolved and fetched, each a new raw/ snapshot,
// then, unless notes are off, one import-notes run whose notes core lands. A refresh is the same
// import of the items' URLs; changed-only refresh compares their snapshot revisions first.

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
  pending: ReturnType<typeof pendingImportNotes>;
  /** Told each step the import takes, for its progress (import-progress.ts). */
  step?: (step: ImportStep) => void;
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
  /** Each changed-only notes batch, when more than one was needed. */
  notesRuns?: NotesRun[];
  /** Notes left as they are, being locked. */
  locked?: string[];
  /** Change-aware refresh audit, absent on ordinary imports. */
  checked?: string[];
  skipped?: string[];
  refreshed?: string[];
  /** Previously failed/unattempted notes retried from existing snapshots. */
  notesRetried?: string[];
};

export type RefreshOptions = {
  changedOnly?: boolean;
  agent?: 'claude' | 'codex';
  yes?: boolean;
  automation?: SessionRecord['automation'];
};

/**
 * Imports `links` into `project`'s vault. Every link resolves and every item is fetched before
 * anything is written, so an unsupported or inaccessible link stops the import with nothing
 * written. Ordinary imports with notes refuse more than NOTES_MAX_ITEMS items. A changed-only
 * refresh skips matching revisions and batches changed notes after all items passed preflight.
 */
export async function importLinks(
  deps: ImportDeps,
  project: string,
  links: readonly string[],
  notes: boolean,
  refresh?: {
    revisions: ReadonlyMap<string, string>;
    agent: 'claude' | 'codex';
    yes?: boolean;
    automation?: SessionRecord['automation'];
  },
): Promise<ImportResult> {
  const sites = await reachedSites(deps.sites);
  const refs = [
    ...new Map(links.map((link) => resolveLink(link, sites)).map((r) => [r.url, r])).values(),
  ];
  if (!refresh && notes && refs.length > NOTES_MAX_ITEMS) {
    throw new MesaError(
      'usage',
      `Write notes takes at most ${NOTES_MAX_ITEMS} items in one import, and this one has ${refs.length}: import them in batches, or with Write notes off (--no-notes)`,
    );
  }
  // One authorized fetch per Source, so its token refreshes once; one item at a time.
  const gets = new Map<SourceId, Http>();
  const items: Item[] = [];
  const skipped: string[] = [];
  deps.step?.({ phase: 'fetching', done: 0, total: refs.length });
  for (const [at, ref] of refs.entries()) {
    const item = await fetchItem(deps, gets, ref, refresh?.revisions.get(ref.url));
    if (item) items.push(item);
    else skipped.push(ref.id);
    deps.step?.({ phase: 'fetching', done: at + 1, total: refs.length });
  }
  const pending = refresh && notes ? deps.pending.list(project) : new Set<string>();
  if (refresh && notes)
    deps.pending.add(
      project,
      items.map((i) => i.url),
    );
  const snapshots = items.map((item) => ({
    item,
    snapshot: writeSnapshot(deps.notes, project, item),
  }));
  const retries =
    refresh && notes
      ? snapshotRows(deps.notes.vault, project)
          .filter(
            (r) =>
              pending.has(r.url) &&
              refs.some((ref) => ref.url === r.url) &&
              !items.some((i) => i.url === r.url),
          )
          .map((r) => ({
            item: { source: r.source, id: r.id, url: r.url, title: r.title, markdown: '' },
            snapshot: r.snapshot,
          }))
      : [];
  const noteSnapshots = [...snapshots, ...retries];
  const result = (
    more: Omit<ImportResult, 'project' | 'items'> = {},
    written = new Map<string, string>(),
  ): ImportResult => ({
    project,
    ...(refresh
      ? { checked: refs.map((r) => r.id), skipped, refreshed: items.map((i) => i.id) }
      : {}),
    ...(retries.length ? { notesRetried: retries.map((r) => r.item.id) } : {}),
    items: noteSnapshots.map(({ item, snapshot }): ImportedItem => {
      const note = written.get(item.url);
      const { source, id, title, url } = item;
      return { source, id, title, url, snapshot, ...(note ? { note } : {}) };
    }),
    ...more,
  });
  if (!notes || !noteSnapshots.length) return result();
  const written = new Map<string, string>();
  const runs: NotesRun[] = [];
  const locked: string[] = [];
  for (let at = 0; at < noteSnapshots.length; at += NOTES_MAX_ITEMS) {
    deps.step?.({ phase: 'notes', done: at, total: noteSnapshots.length });
    const selected = noteSnapshots.slice(at, at + NOTES_MAX_ITEMS);
    const batch = await writeNotes(
      deps,
      project,
      selected,
      refresh?.agent,
      refresh ? { yes: refresh.yes ?? true, automation: refresh.automation } : undefined,
    );
    runs.push(batch.notes);
    for (const [url, path] of batch.written) written.set(url, path);
    locked.push(...(batch.locked ?? []));
    if (!batch.notes.ok) break;
    if (refresh) deps.pending.complete(project, [...batch.written.keys()]);
  }
  return result(
    {
      notes: runs.find((r) => !r.ok) ?? runs[0],
      ...(runs.length > 1 ? { notesRuns: runs } : {}),
      ...(locked.length ? { locked } : {}),
    },
    written,
  );
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
function fetchItem(
  deps: ImportDeps,
  gets: Map<SourceId, Http>,
  ref: ItemRef,
  previousRevision?: string,
) {
  const { connection, fetch } = CONNECTORS[ref.source];
  if (!connection) return fetch(deps.http, ref, previousRevision);
  const get = gets.get(connection) ?? deps.fetch(connection);
  gets.set(connection, get);
  return fetch(get, ref, previousRevision);
}
