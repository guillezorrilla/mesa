import { existsSync } from 'node:fs';
import { MesaError, toFail } from '../lib/result.js';
import type { SessionRecord } from '../sessions/record.js';
import type { HeadlessResult } from '../sessions/run.js';
import { KEEP_MARKER, keptBlocks, restoreKept } from '../skills/keep-sections.js';
import { IMPORT_NOTES } from '../skills/library.js';
import type { Note } from '../vault/frontmatter.js';
import { addToIndex } from '../vault/index-note.js';
import { listVault } from '../vault/inventory.js';
import { projectHubPath, VAULT } from '../vault/layout.js';
import { wikilink } from '../vault/links.js';
import { nameOf } from '../vault/note-name.js';
import {
  type LockedNotesDeps,
  oneLine,
  ownFields,
  readNote,
  refuseLocked,
  writeNote,
} from '../vault/notes.js';
import { vaultFile } from '../vault/scope.js';
import { withVaultLock } from '../vault/vault-lock.js';
import type { Item } from './items.js';

// An import's notes (CONTEXT.md, Import): the import-notes skill run reads the snapshots and
// returns one note per item, and core lands them (ADR-0006: the agent never writes the vault), so
// a failed run changes nothing and the keep blocks are core's to keep.

/** A note an import keeps for one item has `type: import`, its project, and the item's URL. */
const NOTE_TYPE = 'import';
/** The hub's list of imported notes, a keep block so project-brief keeps it. */
const HUB_HEADING = '## Imported';
/** The line before each note in the agent's output. */
const SECTION = /^<!-- note: (\S+) -->$/gm;

/** Each imported note of `project`, by its item's URL. */
export function importNotes(vault: string, project: string): Map<string, string> {
  const notes = new Map<string, string>();
  for (const { path, kind } of listVault(vault, { project, type: VAULT.wiki })) {
    if (kind !== 'markdown') continue;
    const { type, url } = readNote(vault, path).frontmatter;
    if (type === NOTE_TYPE && typeof url === 'string' && !notes.has(url)) notes.set(url, path);
  }
  return notes;
}

/** One item's note in a Write notes run: the snapshot it is written from, and where it goes. */
type PlannedNote = { item: Item; snapshot: string; path: string };

/**
 * Where each item's note goes: the note it has, else a new `wiki/notes/<title slug>.md` (`-2` and
 * on past a note already there). An item whose note is locked gets none and is named in `locked`.
 */
function planNotes(
  vault: string,
  project: string,
  snapshots: readonly { item: Item; snapshot: string }[],
) {
  const existing = importNotes(vault, project);
  const planned: PlannedNote[] = [];
  const locked: string[] = [];
  const taken = (path: string) =>
    planned.some((p) => p.path === path) || existsSync(vaultFile(vault, path));
  for (const { item, snapshot } of snapshots) {
    let path = existing.get(item.url);
    if (path && readNote(vault, path).frontmatter.locked === true) {
      locked.push(path);
      continue;
    }
    if (!path) {
      const title = /[a-z0-9]/i.test(item.title) ? item.title : `${item.source} ${item.id}`;
      const name = `${VAULT.wiki}/notes/${nameOf(title)}`;
      path = `${name}.md`;
      for (let n = 2; taken(path); n++) path = `${name}-${n}.md`;
    }
    planned.push({ item, snapshot, path });
  }
  return { planned, locked };
}

/** The run's arguments: `<snapshot>=<note>` for each item. */
const notesArgs = (planned: readonly PlannedNote[]) =>
  planned.map((p) => `${p.snapshot}=${p.path}`);

/** The agent's output as one body per planned note; internal when it left one out. */
function notesOf(output: string, planned: readonly PlannedNote[]): Map<string, string> {
  const marks = [...output.matchAll(SECTION)];
  const bodies = new Map<string, string>();
  marks.forEach((mark, at) => {
    const [line, path = ''] = mark;
    bodies.set(path, output.slice(mark.index + line.length, marks[at + 1]?.index).trim());
  });
  const missing = planned.filter((p) => !bodies.get(p.path));
  if (missing.length) {
    throw new MesaError(
      'internal',
      `the ${IMPORT_NOTES} run returned no note for ${missing.map((p) => p.path).join(', ')}`,
    );
  }
  return bodies;
}

/** The hub's body with a link to each note it does not link yet, in its Imported block. */
function withImported(body: string, planned: readonly PlannedNote[], path: string): string {
  const lines = planned
    .filter((p) => !body.includes(wikilink(p.path)))
    .map((p) => `- ${wikilink(p.path)}: ${oneLine(p.item.title)}`);
  if (!lines.length) return body;
  const block = keptBlocks(body, path).find((b) =>
    b.startsWith(`${KEEP_MARKER}\n${HUB_HEADING}\n`),
  );
  if (!block) {
    return `${body.trimEnd()}\n\n${KEEP_MARKER}\n${HUB_HEADING}\n\n${lines.join('\n')}\n${KEEP_MARKER}\n`;
  }
  const grown = `${block.slice(0, -KEEP_MARKER.length).trimEnd()}\n${lines.join('\n')}\n${KEEP_MARKER}`;
  return body.replace(block, () => grown);
}

/**
 * Lands an import's notes under the vault lock, all or none: each planned note, with `type:
 * import`, its project, URL, and snapshot, holding exactly the keep blocks it had (restoreKept);
 * a new one's index line; and a link to each from the project hub's Imported block. Everything is
 * checked before the first write: a locked note or hub, or keep markers that do not read, stop it
 * with nothing written.
 */
function landNotes(
  deps: LockedNotesDeps,
  project: string,
  planned: readonly PlannedNote[],
  bodies: Map<string, string>,
) {
  return withVaultLock(deps, async () => {
    const read = (path: string) =>
      existsSync(vaultFile(deps.vault, path)) ? readNote(deps.vault, path) : undefined;
    const hubPath = projectHubPath(project);
    const hub = read(hubPath);
    const writes: { path: string; previous?: Note; note: Note; title: string }[] = planned.map(
      ({ item, snapshot, path }) => {
        const previous = read(path);
        const frontmatter = {
          ...ownFields(previous?.frontmatter ?? {}),
          type: NOTE_TYPE,
          project,
          url: item.url,
          snapshot: wikilink(snapshot),
        };
        const body = restoreKept(bodies.get(path) ?? '', previous?.body ?? '', path);
        return { path, previous, note: { frontmatter, body }, title: item.title };
      },
    );
    const hubBody = withImported(hub?.body ?? `# ${project}\n`, planned, hubPath);
    if (hubBody !== hub?.body) {
      writes.push({
        path: hubPath,
        previous: hub,
        note: {
          frontmatter: { ...(hub ? ownFields(hub.frontmatter) : { type: 'project' }), project },
          body: hubBody,
        },
        title: project,
      });
    }
    for (const { path, previous } of writes) refuseLocked(vaultFile(deps.vault, path), previous);
    for (const { path, previous, note, title } of writes) {
      writeNote(deps, { path, ...note });
      if (!previous && path !== hubPath) addToIndex(deps.vault, path, oneLine(title));
    }
    return planned.map((p) => p.path);
  });
}

/** A Skill run on the project, waited for (the sessions service's run). */
export type SkillRun = (
  skill: string,
  opts: {
    project: string;
    args: string[];
    yes: boolean;
    agent?: 'claude' | 'codex';
    automation?: SessionRecord['automation'];
  },
) => Promise<{ result: HeadlessResult & { session: string } }>;

/** How a Write notes run went: its session, and why it wrote no notes when it wrote none. */
export type NotesRun = { ok: boolean; session?: string; reason?: string };

/**
 * Write notes for an import's snapshots: their notes planned (planNotes), one import-notes run,
 * and its notes landed (landNotes). A run that fails, or whose output does not land, changes no
 * note and says why. The run, the notes written by their item's URL, and the locked ones left.
 */
export async function writeNotes(
  deps: { notes: LockedNotesDeps; run: SkillRun },
  project: string,
  snapshots: readonly { item: Item; snapshot: string }[],
  agent?: 'claude' | 'codex',
  execution?: { yes: boolean; automation?: SessionRecord['automation'] },
): Promise<{ notes: NotesRun; written: Map<string, string>; locked?: string[] }> {
  const { planned, locked } = planNotes(deps.notes.vault, project, snapshots);
  const extra = locked.length ? { locked } : {};
  const none = new Map<string, string>();
  if (!planned.length) return { notes: { ok: true }, written: none, ...extra };
  let session: string | undefined;
  try {
    const { result } = await deps.run(IMPORT_NOTES, {
      project,
      args: notesArgs(planned),
      yes: execution?.yes ?? true,
      ...(execution?.automation ? { automation: execution.automation } : {}),
      ...(agent ? { agent } : {}),
    });
    session = result.session;
    if (!result.ok) {
      throw new MesaError('internal', result.reason ?? `the ${IMPORT_NOTES} run failed`);
    }
    await landNotes(deps.notes, project, planned, notesOf(result.output, planned));
    const written = new Map(planned.map((p) => [p.item.url, p.path]));
    return { notes: { ok: true, session }, written, ...extra };
  } catch (error) {
    const reason = toFail(error).error.message;
    return {
      notes: { ok: false, ...(session ? { session } : {}), reason },
      written: none,
      ...extra,
    };
  }
}
