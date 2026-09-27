import { existsSync, readFileSync } from 'node:fs';
import { receiptLink } from '../receipts/receipt-file.js';
import { VAULT } from '../vault/layout.js';
import { appendLog, type LockedNotesDeps, readNote, vaultFile, writeNote } from '../vault/notes.js';
import { withVaultLock } from '../vault/vault-lock.js';
import { keepSections } from './keep-sections.js';

// Where a skill's output lands in the vault: core writes the note a skill run's output becomes
// (ADR-0006: the agent never writes the vault). One entry per skill that lands; a skill without
// one lands nowhere, and its output stays in the run's result.

/** The run whose output lands: its session, its project, and the session it is about, if any. */
type Landed = { run: string; project: string; about?: string; repo?: string; endedAt: string };

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
 * writeNote, its frontmatter naming the run, its project, and the session it is about, and linking
 * the run's `receipt` (a vault path); then a log.md line linking both. Under the vault lock, and
 * once per run: a note this run already wrote is left as it is, since the wait in `mesa run` and
 * tmux's pane-died hook may both end the run. The note's path, or undefined when the output lands
 * nowhere.
 */
export async function landOutput(
  deps: LockedNotesDeps,
  skill: string,
  run: Landed,
  output: string,
  receipt?: string,
): Promise<string | undefined> {
  const landing = landingOf(skill, run);
  if (!landing) return undefined;
  const { path, type } = landing;
  if (skill === 'project-brief' && !run.repo) {
    throw new Error(`registered repo path missing for ${run.project}`);
  }
  await withVaultLock(deps, async () => {
    const link = receipt ? receiptLink(receipt) : undefined;
    const line = `${landing.said(run)} in [[${path.replace(/\.md$/, '')}]] ${link ?? ''}`;
    const log = vaultFile(deps.vault, VAULT.log);
    // A completed retry must not overwrite a newer run's note either.
    if (existsSync(log) && readFileSync(log, 'utf8').includes(line)) return;
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
    if (before?.run !== run.run && !newer)
      writeNote(deps, {
        path,
        frontmatter: {
          type,
          ...(skill === 'project-brief' ? { repo: run.repo } : {}),
          ...(run.about ? { session: run.about } : {}),
          project: run.project,
          run: run.run,
          endedAt: run.endedAt,
          ...(link ? { receipt: link } : {}),
        },
        body:
          skill === 'project-brief'
            ? keepSections(output, previous?.body ?? '', path)
            : `${output.trim()}\n`,
      });
    // A crash after the note write can leave its log line missing. Repair it without a duplicate.
    appendLog(deps, line);
  });
  return path;
}
