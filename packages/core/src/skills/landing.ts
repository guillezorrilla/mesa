import { existsSync, readFileSync } from 'node:fs';
import type { Agent } from '../agents/names.js';
import type { MesaContext } from '../context.js';
import { receiptLink } from '../receipts/receipt-file.js';
import { listReceipts } from '../receipts/store.js';
import { VAULT } from '../vault/layout.js';
import { appendLog, type LockedNotesDeps, readNote, vaultFile, writeNote } from '../vault/notes.js';
import { withVaultLock } from '../vault/vault-lock.js';
import { keepSections } from './keep-sections.js';

// Where a skill's output lands in the vault: core writes the note a skill run's output becomes
// (ADR-0006: the agent never writes the vault). One entry per skill that lands; a skill without
// one lands nowhere, and its output stays in the run's result.

/** The run whose output lands: its session, its project, and the session it is about, if any. */
type Landed = {
  run: string;
  project: string;
  about?: string;
  repo?: string;
  agent?: Agent;
  endedAt: string;
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
  // A summary of the session the run was given the output log of (mesa run --session).
  'session-summary': {
    type: 'session-summary',
    path: ({ about }) => about && `${VAULT.wiki}/sessions/${about}.md`,
    said: ({ about, project }) => `Summarised session ${about} on ${project}`,
  },
  'project-brief': {
    type: 'project',
    path: ({ project }) => `${VAULT.projects}/${project}.md`,
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
 * Writes a skill run's `output` as the note its skill's landing names (landingOf), through
 * writeNote, its frontmatter naming the run, its project, and the session it is about. A changed
 * note gets one vault-change receipt and log line. Under the vault lock, and
 * once per run: a note this run already wrote is left as it is, since the wait in `mesa run` and
 * tmux's pane-died hook may both end the run. The note's path, or undefined when the output lands
 * nowhere.
 */
export async function landOutput(
  deps: LockedNotesDeps & Pick<MesaContext, 'record'>,
  skill: string,
  run: Landed,
  output: string,
): Promise<
  { path: string; receipt?: { id: string; path: string } | null; warning?: string } | undefined
> {
  const landing = landingOf(skill, run);
  if (!landing) return undefined;
  const { path, type } = landing;
  if (skill === 'project-brief' && !run.repo) {
    throw new Error(`registered repo path missing for ${run.project}`);
  }
  const recorded = await withVaultLock(deps, async () => {
    const target = `[[${path.replace(/\.md$/, '')}]]`;
    const log = vaultFile(deps.vault, VAULT.log);
    const priorReceipt = listReceipts(deps.vault, Number.POSITIVE_INFINITY, {
      project: run.project,
    }).find(
      (entry) => entry.receipt.kind === 'vault-change' && entry.receipt.inputs.run === run.run,
    );
    if (priorReceipt) {
      const line = `${landing.said(run)} in ${path.replace(/\.md$/, '')} ${receiptLink(priorReceipt.path)}`;
      if (existsSync(log) && !readFileSync(log, 'utf8').includes(line)) appendLog(deps, line);
      return { receipt: { id: priorReceipt.receipt.id, path: priorReceipt.path } };
    }
    const previous = existsSync(vaultFile(deps.vault, path))
      ? readNote(deps.vault, path)
      : undefined;
    // The immutable completion time survives a failed log append. Equal times use the run id
    // for a stable order, so an old retry can never oscillate the note between two runs.
    const before = previous?.frontmatter;
    const newer =
      typeof before?.endedAt === 'string' &&
      typeof before.run === 'string' &&
      `${before.endedAt}:${before.run}` > `${run.endedAt}:${run.run}`;
    const body =
      skill === 'project-brief'
        ? keepSections(output, previous?.body ?? '', path)
        : `${output.trim()}\n`;
    const changed = !newer && previous?.body !== body;
    if (changed && before?.run !== run.run)
      writeNote(deps, {
        path,
        frontmatter: {
          type,
          ...(skill === 'project-brief' ? { repo: run.repo } : {}),
          ...(run.about ? { session: run.about } : {}),
          project: run.project,
          run: run.run,
          endedAt: run.endedAt,
        },
        body,
      });
    if (!changed && before?.run !== run.run) return undefined;
    const recorded = deps.record(
      {
        kind: 'vault-change',
        summary: () => `${landing.said(run)} in ${target}`,
        failure: `Could not write ${path}`,
        project: () => run.project,
        session: () => run.about,
        agent: () => run.agent,
        inputs: { skill, run: run.run, target: path },
        outputs: () => ({ target: path, link: target }),
      },
      () => path,
    );
    return { receipt: recorded.receipt, warning: recorded.warning };
  });
  return { path, ...recorded };
}
