import { existsSync } from 'node:fs';
import type { Agent } from '../agents/names.js';
import type { MesaContext } from '../context.js';
import { recordNoteChange } from '../receipts/note-change.js';
import { listReceipts, restoreLogLine } from '../receipts/store.js';
import { VAULT } from '../vault/layout.js';
import { type LockedNotesDeps, readNote, writeNote } from '../vault/notes.js';
import { vaultFile } from '../vault/scope.js';
import { withVaultLock } from '../vault/vault-lock.js';
import { keepSections } from './keep-sections.js';

// Where a skill's output lands in the vault: core writes the note a skill run's output becomes
// (ADR-0006: the agent never writes the vault), and the summary a session saves itself (mesa
// vault save summary) lands as a session-summary run's does. One entry per skill that lands; a
// skill without one lands nowhere, and its output stays in the run's result.

/**
 * Whose output lands: a skill run's, once per run, or a session's own summary (no `run`), which
 * lands whenever its text changes.
 */
type Landed = {
  /** The skill run whose output this is. */
  run?: string;
  project?: string;
  /** The session the output is about. */
  about?: string;
  repo?: string;
  agent?: Agent;
  /** The run's completion time, which orders its retries. */
  endedAt?: string;
  /** Who saves it, when it is no run's. */
  actor?: string;
  /** The argv its receipt records instead of the invocation's (a saved text shortened). */
  argv?: readonly string[];
};

type Landing = {
  /** The note's `type` in its frontmatter. */
  type: string;
  /** The note's path in the vault; undefined when this run's output lands nowhere. */
  path: (run: Landed) => string | undefined;
  /** What the log.md line says, before its links. */
  said: (run: Landed) => string;
};

const LANDINGS: Record<string, Landing> = {
  // A summary of the session the run was given the output log of (mesa run --session), or of the
  // session saving it.
  'session-summary': {
    type: 'session-summary',
    path: ({ about }) => about && `${VAULT.wiki}/sessions/${about}.md`,
    said: ({ about, project }) => `Summarised session ${about}${project ? ` on ${project}` : ''}`,
  },
  'project-brief': {
    type: 'project',
    path: ({ project }) => project && `${VAULT.projects}/${project}.md`,
    said: ({ project }) => `Updated project brief for ${project}`,
  },
};

/** Where `skill`'s output lands for this run, if anywhere. */
export function landingOf(skill: string, run: Landed) {
  const landing = Object.hasOwn(LANDINGS, skill) ? LANDINGS[skill] : undefined;
  const path = landing?.path(run);
  return landing && path ? { ...landing, path } : undefined;
}

/**
 * Writes `output` as the note its skill's landing names (landingOf), through writeNote, its
 * frontmatter naming the session it is about, its project, and the run. A changed body gets one
 * vault-change receipt and log line; an unchanged one gets none, and its latest receipt's log
 * line back if an interrupted append lost it. Under the vault lock, and once per run: a note this
 * run already wrote is left as it is, since the wait in `mesa run` and tmux's pane-died hook may
 * both end the run. The note's path and whether this call changed it, or undefined when the
 * output lands nowhere.
 */
export async function landOutput(
  deps: LockedNotesDeps & Pick<MesaContext, 'record'>,
  skill: string,
  run: Landed,
  output: string,
): Promise<
  | {
      path: string;
      changed: boolean;
      receipt: { id: string; path: string } | null;
      warning?: string;
    }
  | undefined
> {
  const landing = landingOf(skill, run);
  if (!landing) return undefined;
  const { path, type } = landing;
  if (skill === 'project-brief' && !run.repo) {
    throw new Error(`registered repo path missing for ${run.project}`);
  }
  return withVaultLock(deps, async () => {
    const receipts = listReceipts(deps.vault, Number.POSITIVE_INFINITY, {
      project: run.project,
      target: path,
    });
    const prior =
      run.run === undefined
        ? undefined
        : receipts.find(
            (e) => e.receipt.kind === 'vault-change' && e.receipt.inputs.run === run.run,
          );
    if (prior) {
      restoreLogLine(deps, prior);
      return { path, changed: false, receipt: { id: prior.receipt.id, path: prior.path } };
    }
    const previous = existsSync(vaultFile(deps.vault, path))
      ? readNote(deps.vault, path)
      : undefined;
    // The immutable completion time survives a failed log append. Equal times use the run id
    // for a stable order, so an old retry can never oscillate the note between two runs.
    const before = previous?.frontmatter;
    const newer =
      run.run !== undefined &&
      typeof before?.endedAt === 'string' &&
      typeof before.run === 'string' &&
      `${before.endedAt}:${before.run}` > `${run.endedAt}:${run.run}`;
    const body =
      skill === 'project-brief'
        ? keepSections(output, previous?.body ?? '', path)
        : `${output.trim()}\n`;
    const changed = !newer && previous?.body !== body;
    // This run wrote the note already, and its receipt is what is missing.
    const mine = run.run !== undefined && before?.run === run.run;
    if (changed && !mine)
      writeNote(deps, {
        path,
        frontmatter: {
          type,
          ...(skill === 'project-brief' ? { repo: run.repo } : {}),
          ...(run.about ? { session: run.about } : {}),
          ...(run.project ? { project: run.project } : {}),
          ...(run.run ? { run: run.run, endedAt: run.endedAt } : {}),
        },
        body,
      });
    if (!changed && !mine) {
      const latest = receipts[0];
      if (latest) restoreLogLine(deps, latest);
      return { path, changed: false, receipt: null };
    }
    const recorded = recordNoteChange(deps, {
      path,
      said: landing.said(run),
      project: run.project,
      session: run.about,
      agent: run.agent,
      actor: run.run ?? run.actor,
      inputs: run.run ? { skill, run: run.run } : {},
      ...(run.argv ? { argv: run.argv } : {}),
    });
    return {
      path,
      changed: true,
      receipt: recorded.receipt,
      ...(recorded.warning ? { warning: recorded.warning } : {}),
    };
  });
}
