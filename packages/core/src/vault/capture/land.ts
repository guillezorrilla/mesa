import type { MesaContext } from '../../context.js';
import { redactWhole } from '../../lib/redact.js';
import { MesaError, toFail } from '../../lib/result.js';
import { localDay } from '../../lib/time.js';
import type { ActionSpec } from '../../receipts/recorder.js';
import { recordAgent, type SessionRecord } from '../../sessions/record/record.js';
import type { HeadlessResult } from '../../sessions/run/files.js';
import { VAULT_CAPTURE } from '../../skills/library.js';
import type { Note } from '../frontmatter.js';
import { oneLine } from '../notes.js';
import {
  applyKeep,
  decisionName,
  decisionNote,
  existingNote,
  type Kept,
  noteName,
  type Odds,
  plainNote,
  prepareKeep,
} from '../saved-notes.js';
import { withVaultLock } from '../vault-lock.js';
import { coveringNote } from './cover.js';
import { type CaptureItem, captureItems } from './items.js';

// A Vault capture's landing (CONTEXT.md, Vault capture): core saves what the vault-capture run
// returned (ADR-0006: the agent never writes the vault), all or none, with one receipt, and keeps
// how it went on the captured session's record.

/** What landing a capture takes: the records, the vault, receipts, and redaction. */
export type CaptureContext = Pick<
  MesaContext,
  'store' | 'notes' | 'record' | 'clock' | 'home' | 'secrets'
>;

/** One item as a capture saved it: where, whether that changed the note, and its odds. */
type SavedItem = Odds & {
  kind: CaptureItem['kind'];
  title: string;
  path: string;
  changed: boolean;
};

/** How a landing went: the notes it changed and every item; `again` when another landed it. */
type Landed = { notes: string[]; items: SavedItem[]; again?: true };

/** An item ready to land: its note, the note found to cover it, and the name a new one takes. */
type Planned = { item: CaptureItem; title: string; note: Note; covering?: string; name: string };

/**
 * The capture field of session `id` from now on, replaced under its record's lock, with its mark:
 * `through` moves to the claim's `upTo` when run `landed` lands the claim it holds (or one with no
 * run yet, as a run quick enough to land first or a capture by hand has); else it stays.
 */
const settle = (
  store: CaptureContext['store'],
  id: string,
  capture: NonNullable<SessionRecord['capture']>,
  landed?: string,
) =>
  store.update(id, (current) => {
    const claim = current.capture?.state === 'running' ? current.capture : undefined;
    const ours = landed && claim && (!claim.run || claim.run === landed);
    const through = (ours && claim.upTo) || current.capture?.through;
    return { capture: { ...capture, ...(through ? { through } : {}) } };
  });

/**
 * The receipt of `about`'s capture by `run`: kind `capture`, kept whether it saved notes or
 * failed (policy.ts), naming the notes, and each item with its odds; none when it saved nothing.
 */
const captureSpec = (about: SessionRecord, run?: string): ActionSpec<Landed> => ({
  kind: 'capture',
  summary: (r) =>
    `Captured ${r.notes.length} note${r.notes.length === 1 ? '' : 's'} from session ${about.id} on ${about.project}: ${r.notes.join(', ')}`,
  failure: `Could not capture session ${about.id} on ${about.project}`,
  project: () => about.project,
  session: () => about.id,
  agent: () => recordAgent(about),
  scope: { project: about.project, session: about.id, agent: recordAgent(about), actor: run },
  inputs: { session: about.id, ...(run ? { run } : {}) },
  outputs: (r) => ({ notes: r.notes, items: r.items, target: r.notes[0] }),
  changed: (r) => !r.again && r.notes.length > 0,
});

/**
 * A capture of `about` that did not happen: its record says why (`failed`), and so does a
 * failed `capture` receipt. Never throws.
 */
export async function captureFailed(
  ctx: Pick<CaptureContext, 'store' | 'record' | 'clock'>,
  about: SessionRecord,
  error: unknown,
) {
  const reason = toFail(error).error.message;
  settle(ctx.store, about.id, { state: 'failed', at: ctx.clock().toISOString(), reason });
  await ctx.record(captureSpec(about), () => Promise.reject(error)).catch(() => undefined);
  return reason;
}

/** Each item's note and the note that covers it, if one does, found before the vault lock. */
function plan(ctx: CaptureContext, about: SessionRecord, items: readonly CaptureItem[]): Planned[] {
  const { vault } = ctx.notes();
  const day = localDay(ctx.clock());
  const planned: Planned[] = [];
  for (const item of items) {
    const title = oneLine(item.title);
    const { project } = about;
    const note =
      item.kind === 'decision'
        ? decisionNote({
            project,
            session: about.id,
            title,
            decision: item.decision,
            rationale: item.rationale,
            odds: {
              ...(item.probabilities ? { probabilities: item.probabilities } : {}),
              ...(item.confidence === undefined ? {} : { confidence: item.confidence }),
            },
          })
        : plainNote({ project, session: about.id, title, text: item.body });
    const covering = coveringNote(vault, project, { ...item, title });
    const name = item.kind === 'decision' ? decisionName(day, title) : noteName(title);
    planned.push({ item, title, note, ...(covering ? { covering } : {}), name });
  }
  return planned;
}

/**
 * Each planned note at its path, checked before the first write: the note that covers it, unless
 * another item took it or it became the person's, else a new path (`-2` and on). A refusal stops
 * the landing with nothing written. Then each changed note is written, a new one indexed.
 */
function write(ctx: CaptureContext, about: SessionRecord, planned: readonly Planned[]): Landed {
  const notes = ctx.notes();
  const taken = new Set<string>();
  const kept: { planned: Planned; kept: Kept }[] = planned.map((p) => {
    let found: Kept | undefined;
    if (p.covering && !taken.has(p.covering)) {
      try {
        found = prepareKeep(notes.vault, p.covering, p.note, about.project);
      } catch {
        found = undefined;
      }
    }
    for (let n = 1; !found; n++) {
      const path = `${p.name}${n > 1 ? `-${n}` : ''}.md`;
      if (!taken.has(path) && !existingNote(notes.vault, path, about.project))
        found = prepareKeep(notes.vault, path, p.note, about.project);
    }
    taken.add(found.path);
    return { planned: p, kept: found };
  });
  for (const { planned: p, kept: k } of kept) if (!k.same) applyKeep(notes, k, p.title);
  const items = kept.map(({ planned: { item, title }, kept: k }) => ({
    kind: item.kind,
    title,
    path: k.path,
    changed: !k.same,
    ...(item.kind === 'decision' && item.probabilities
      ? { probabilities: item.probabilities }
      : {}),
    ...(item.kind === 'decision' && item.confidence !== undefined
      ? { confidence: item.confidence }
      : {}),
  }));
  return { notes: items.filter((i) => i.changed).map((i) => i.path), items };
}

/**
 * Lands vault-capture run `run`'s result `read` for the session it is about, once per run
 * (finishRun may end a run twice): its items parsed (captureItems, from the redacted output) and
 * their covering notes found, then, under the vault lock, all written or none, and the session's
 * record `done` with the notes and its mark moved (settle), under one `capture` receipt (none
 * for a capture that saved nothing). A run that failed, output that does not read, or a refused
 * write changes no note and keeps the mark, and the record and a failed receipt say why. Never
 * throws: its receipt, and a warning.
 */
export async function landCapture(
  ctx: CaptureContext,
  run: SessionRecord,
  read: HeadlessResult,
): Promise<{ receipt?: { id: string; path: string } | null; warning?: string }> {
  const about = run.about ? ctx.store.find(run.about) : undefined;
  if (!about) return { warning: `run ${run.id}'s session is gone: nothing captured` };
  const settled = (r: SessionRecord) => r.capture?.run === run.id && r.capture.state !== 'running';
  if (settled(about)) return {};
  const at = () => ctx.clock().toISOString();
  try {
    const recorded = await ctx.record(captureSpec(about, run.id), async () => {
      let planned: Planned[] = [];
      let problem: unknown;
      try {
        if (!read.ok) {
          throw new MesaError('internal', read.reason ?? `the ${VAULT_CAPTURE} run failed`);
        }
        const items = captureItems(redactWhole(read.output, ctx.home, ctx.secrets()));
        planned = plan(ctx, about, items);
      } catch (error) {
        problem = error;
      }
      return withVaultLock(ctx.notes(), async (): Promise<Landed> => {
        const now = ctx.store.get(about.id);
        if (settled(now)) return { notes: now.capture?.notes ?? [], items: [], again: true };
        try {
          if (problem) throw problem;
          const landed = write(ctx, about, planned);
          settle(
            ctx.store,
            about.id,
            { run: run.id, at: at(), state: 'done', notes: landed.notes },
            run.id,
          );
          return landed;
        } catch (error) {
          const reason = toFail(error).error.message;
          settle(ctx.store, about.id, { run: run.id, at: at(), state: 'failed', reason });
          throw error;
        }
      });
    });
    const { receipt } = recorded;
    if (receipt)
      ctx.store.update(about.id, (current) =>
        current.capture?.run === run.id
          ? { capture: { ...current.capture, receipt: receipt.path } }
          : {},
      );
    return { receipt, ...(recorded.warning ? { warning: recorded.warning } : {}) };
  } catch (error) {
    return {
      warning: `session ${about.id}'s capture saved no note: ${toFail(error).error.message}`,
    };
  }
}
