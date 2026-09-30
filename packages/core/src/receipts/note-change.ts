import type { Agent } from '../agents/names.js';
import type { MesaContext } from '../context.js';
import type { Clock } from '../lib/clock.js';
import { wikilink } from '../vault/links.js';
import { listReceipts, restoreLogLine } from './store.js';

/** A substantive change to one vault note, as its one history entry says it (CONTEXT.md, Receipt). */
export type NoteChange = {
  /** The changed note, vault-relative. */
  path: string;
  /** What the change's receipt and log.md line say, before ` in <the note>`. */
  said: string;
  /** A deliberately saved decision, or any other note change (the default). */
  kind?: 'decision' | 'vault-change';
  project?: string;
  session?: string;
  agent?: Agent;
  /** The Mesa session that made the change, when known. */
  actor?: string;
  /** What the change was given; the note joins them as `target`. */
  inputs?: Record<string, unknown>;
  /** The argv to record instead of the invocation's (a long note text shortened). */
  argv?: readonly string[];
};

/**
 * The one receipt of a note change: its summary and log.md line (writeReceipt appends it) name
 * the note, and its `target` and `link` point at it. Callers hold the vault lock, so a note and
 * its entry pair up.
 */
export function recordNoteChange(deps: Pick<MesaContext, 'record'>, change: NoteChange) {
  const { path, said, kind = 'vault-change' } = change;
  const link = wikilink(path);
  return deps.record(
    {
      kind,
      ...(kind === 'decision' ? { type: 'decision' as const } : {}),
      ...(change.argv ? { argv: change.argv } : {}),
      summary: () => `${said} in ${link}`,
      failure: `Could not write ${path}`,
      project: () => change.project,
      session: () => change.session,
      agent: () => change.agent,
      scope: { actor: change.actor },
      inputs: { ...change.inputs, target: path },
      outputs: () => ({ target: path, link }),
    },
    () => path,
  );
}

/**
 * The history of a note a save finds already saying what it would write: its latest receipt's
 * log.md line back, if an interrupted append lost it; or, when no receipt names the note (a save
 * interrupted after its write), the change's one entry now, which it returns. Callers hold the
 * vault lock.
 */
export function settleUnchanged(
  deps: Pick<MesaContext, 'record'> & { vault: string; clock: Clock },
  change: NoteChange,
) {
  const [latest] = listReceipts(deps.vault, 1, { target: change.path });
  if (!latest) return recordNoteChange(deps, change);
  restoreLogLine(deps, latest);
  return undefined;
}
