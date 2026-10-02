import { existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { MesaContext } from '../context.js';
import { redactWhole } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { readTextFile } from '../lib/text-file.js';
import { localDay } from '../lib/time.js';
import { receiptText } from '../receipts/command.js';
import { type NoteChange, recordNoteChange, settleUnchanged } from '../receipts/note-change.js';
import { recordScope } from '../receipts/record-scope.js';
import type { Recorded } from '../receipts/recorder.js';
import { recordAgent } from '../sessions/record.js';
import { keepSections } from '../skills/keep-sections.js';
import { landOutput } from '../skills/landing.js';
import type { Frontmatter, Note } from './frontmatter.js';
import { addToIndex } from './index-note.js';
import { itemProject } from './item.js';
import { projectHubPath, VAULT } from './layout.js';
import { wikilink } from './links.js';
import { nameOf } from './note-name.js';
import {
  type LockedNotesDeps,
  oneLine,
  ownFields,
  readNote,
  refuseForeign,
  requireLog,
  writeNote,
} from './notes.js';
import { canonicalVaultPath, vaultFile, vaultWriteFile } from './scope.js';
import { withVaultLock } from './vault-lock.js';

// Session writes (CONTEXT.md, Session write): the decisions, summaries, and notes a session saves
// in the vault (ADR-0006: core writes it). Each is a note Mesa keeps, with one history entry when
// the save changed it (#274); the same save again adds nothing.

export type DecisionInput = {
  project: string;
  /** The Mesa session it is from; default: the Caller, when it is on the project. */
  session?: string;
  title: string;
  decision: string;
  rationale: string;
  /** Faro's probability per option, from `mesa decide`. */
  probabilities?: Record<string, number>;
  confidence?: number;
};

/** A summary is its text, or a file (relative to the working directory) holding it. */
export type SummaryInput = { session: string; summary?: string; file?: string };

export type NoteInput = {
  project?: string;
  session?: string;
  /** Under `wiki/` or `projects/<project>/`; default `wiki/notes/<slug of the title>.md`. */
  path?: string;
  title: string;
  body?: string;
  file?: string;
};

/** Where a save landed, and whether it changed the note there. */
export type Saved = { path: string; changed: boolean };

type WriteDeps = LockedNotesDeps & Pick<MesaContext, 'record'>;

const usage = (message: string) => new MesaError('usage', message);

/** A field a save needs, trimmed. */
function required(value: string | undefined, what: string): string {
  const text = value?.trim();
  if (!text) throw usage(`a save needs its ${what}`);
  return text;
}

/** A number from 0 to 1, as Faro's probabilities and confidence are. */
function unit(value: number, what: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw usage(`${what} must be from 0 to 1, not ${value}`);
  }
  return value;
}

/** Whether two notes say the same: their bodies, and their own frontmatter (not writeNote's). */
const sameContent = (a: Note, b: Note) =>
  a.body === b.body && isDeepStrictEqual(ownFields(a.frontmatter), b.frontmatter);

/**
 * Keeps `note` in the vault, under its lock, at the path `place` picks given what is there. A note
 * there that is the person's (locked, or not Mesa's) is refused (refuseForeign), with no receipt.
 * One whose own content is the same writes nothing (settleUnchanged: a lost log line back, or the
 * entry and index line an interrupted save left out). Otherwise the note is written, keeping the
 * blocks between paired `<!-- keep -->` markers of the one it replaces; a new note gets its index
 * line (bookkeeping); and the change gets its one history entry.
 */
async function keep(
  deps: WriteDeps,
  note: Note,
  change: Omit<NoteChange, 'path'>,
  summary: string,
  place: (read: (path: string) => Note | undefined) => string,
): Promise<Recorded<Saved>> {
  requireLog(deps.vault);
  const read = (path: string) => {
    const file = vaultWriteFile(deps.vault, path, change.project);
    return existsSync(file) ? readNote(deps.vault, path) : undefined;
  };
  return withVaultLock(deps, async () => {
    const path = place(read);
    const previous = read(path);
    refuseForeign(vaultFile(deps.vault, path), previous);
    const next = { ...note, body: keepSections(note.body, previous?.body ?? '', path) };
    const entry = (recorded: Omit<Recorded<unknown>, 'result'>): Recorded<Saved> => ({
      result: { path, changed: true },
      receipt: recorded.receipt,
      ...(recorded.warning ? { warning: recorded.warning } : {}),
    });
    if (previous && sameContent(previous, next)) {
      const settled = settleUnchanged(deps, { ...change, path });
      if (!settled) return { result: { path, changed: false }, receipt: null };
      addToIndex(deps.vault, path, summary);
      return entry(settled);
    }
    writeNote(deps, { path, ...next });
    if (!previous) addToIndex(deps.vault, path, summary);
    return entry(recordNoteChange(deps, { ...change, path }));
  });
}

/**
 * A given note path, `.md` added when it has none: under `wiki/`, or under `projects/<project>/`
 * (the project hub itself is project-brief's), and in the vault's scope. Anywhere else (raw,
 * receipts, daily, a top-level note, an internal) is a usage error.
 */
function notePath(vault: string, path: string): string {
  const file = path.endsWith('.md') ? path : `${path}.md`;
  vaultFile(vault, file);
  const [top, ...rest] = file.split('/');
  const fits =
    (top === VAULT.wiki && rest.length >= 1) || (top === VAULT.projects && rest.length >= 2);
  if (!fits) throw usage(`a note goes under wiki/ or projects/<project>/, not ${path}`);
  return file;
}

/** The session writes of one profile: saveDecision, saveSummary, and saveNote. */
export function sessionWrites(ctx: MesaContext) {
  const { deps } = ctx;
  const writes = (): WriteDeps => ({ ...ctx.notes(), record: ctx.record });
  const redact = (text: string) => redactWhole(text, deps.home, ctx.secrets());
  /** A save's text: given, or read from a file; its receipt's argv then keeps it short. */
  const textOf = (text: string | undefined, file: string | undefined, what: string) => {
    if (text !== undefined && file !== undefined) {
      throw usage(`pass the ${what} as text or as a file, not both`);
    }
    const raw = file === undefined ? text : readTextFile(ctx.absolute(file), `${what} file`);
    const value = required(raw, what);
    const argv = text === undefined ? undefined : receiptText(text, deps.argv, ctx.secrets()).argv;
    return { value: redact(value), ...(argv ? { argv } : {}) };
  };

  return {
    /**
     * Saves a decision at `wiki/decisions/<YYYY-MM-DD>-<slug>.md` (`type: decision`), linking
     * its project hub, with one `decision` receipt keeping the rationale, and the probabilities
     * and confidence when given.
     */
    saveDecision: async (input: DecisionInput): Promise<Recorded<Saved>> => {
      const { session, actor } = recordScope(ctx, input);
      const { project } = input;
      const title = redact(oneLine(required(input.title, 'title')));
      const [decision, rationale] = [
        required(input.decision, 'decision'),
        required(input.rationale, 'rationale'),
      ].map(redact) as [string, string];
      const probabilities = Object.entries(input.probabilities ?? {}).map(([option, p]) => {
        if (!option) throw usage('a probability needs its option: <option>=<p>');
        return [redact(option), unit(p, `the probability of ${option}`)] as const;
      });
      const confidence =
        input.confidence === undefined ? undefined : unit(input.confidence, 'the confidence');
      const odds = {
        ...(probabilities.length ? { probabilities: Object.fromEntries(probabilities) } : {}),
        ...(confidence === undefined ? {} : { confidence }),
      };
      const name = `${VAULT.wiki}/decisions/${localDay(deps.clock())}-${nameOf(title)}`;
      const frontmatter: Frontmatter = {
        type: 'decision',
        project,
        ...(session ? { session: session.id } : {}),
        ...odds,
      };
      const body = `# ${title}\n\n${decision}\n\n## Rationale\n\n${rationale}\n\nProject: ${wikilink(projectHubPath(project))}\n`;
      return keep(
        writes(),
        { frontmatter, body },
        {
          said: `Saved decision ${title} for ${project}`,
          kind: 'decision',
          project,
          session: session?.id,
          agent: session && recordAgent(session),
          actor: actor?.id,
          inputs: { title, decision, rationale, ...odds },
        },
        title,
        // Another decision of the same title and day gets `-2`, `-3`, and on: the note that holds
        // this decision (its title, decision, rationale, and project) is the one it updates.
        (read) => {
          for (let n = 1; ; n++) {
            const path = `${name}${n > 1 ? `-${n}` : ''}.md`;
            const there = read(path);
            if (!there || there.body.startsWith(body.trim())) return path;
          }
        },
      );
    },

    /**
     * Saves a session's summary at `wiki/sessions/<id>.md` as a session-summary run lands one
     * (landOutput): a changed text gets one `vault-change` receipt, the same text nothing.
     */
    saveSummary: async (input: SummaryInput): Promise<Recorded<Saved>> => {
      const { project, session, actor } = recordScope(ctx, { session: input.session });
      const summary = textOf(input.summary, input.file, 'summary');
      const notes = writes();
      requireLog(notes.vault);
      const landed = await landOutput(
        notes,
        'session-summary',
        {
          about: session?.id,
          project,
          agent: session && recordAgent(session),
          actor: actor?.id,
          ...(summary.argv ? { argv: summary.argv } : {}),
        },
        summary.value,
      );
      if (!landed) throw new MesaError('internal', 'a session summary lands nowhere');
      const { path, changed, receipt, warning } = landed;
      return { result: { path, changed }, receipt, ...(warning ? { warning } : {}) };
    },

    /**
     * Saves a note at `path` (under `wiki/` or `projects/<project>/`), else at
     * `wiki/notes/<slug>.md`, headed by its title unless its text starts with a heading. A new
     * note gets an index line; a change, one `vault-change` receipt.
     */
    saveNote: async (input: NoteInput): Promise<Recorded<Saved>> => {
      const title = redact(oneLine(required(input.title, 'title')));
      const path = notePath(ctx.vaultOf(), input.path ?? `${VAULT.wiki}/notes/${nameOf(title)}.md`);
      const canonical = canonicalVaultPath(ctx.vaultOf(), path);
      notePath(ctx.vaultOf(), canonical);
      const inFolder = itemProject(path) ?? itemProject(canonical);
      if (input.project && inFolder && input.project !== inFolder) {
        throw usage(`${path} is in project ${inFolder}'s folder, not ${input.project}'s`);
      }
      const { project, session, actor } = recordScope(ctx, {
        project: input.project ?? inFolder,
        session: input.session,
      });
      const text = textOf(input.body, input.file, 'note');
      const heading = text.value.startsWith('# ') ? '' : `# ${title}\n\n`;
      const frontmatter: Frontmatter = {
        type: 'note',
        ...(project ? { project } : {}),
        ...(session ? { session: session.id } : {}),
      };
      return keep(
        writes(),
        { frontmatter, body: `${heading}${text.value}\n` },
        {
          said: `Saved note ${title}${project ? ` for ${project}` : ''}`,
          project,
          session: session?.id,
          agent: session && recordAgent(session),
          actor: actor?.id,
          inputs: { title },
          ...(text.argv ? { argv: text.argv } : {}),
        },
        title,
        () => path,
      );
    },
  };
}
