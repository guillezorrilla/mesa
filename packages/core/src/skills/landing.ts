import { existsSync } from 'node:fs';
import { receiptLink } from '../receipts/receipt-file.js';
import { VAULT } from '../vault/layout.js';
import { appendLog, type LockedNotesDeps, readNote, vaultFile, writeNote } from '../vault/notes.js';
import { withVaultLock } from '../vault/vault-lock.js';

// Where a skill's output lands in the vault: core writes the note a skill run's output becomes
// (ADR-0006: the agent never writes the vault). One entry per skill that lands; a skill without
// one lands nowhere, and its output stays in the run's result.

/** The run whose output lands: its session, its project, and the session it is about, if any. */
type Landed = { run: string; project: string; about?: string };

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
  await withVaultLock(deps, async () => {
    if (existsSync(vaultFile(deps.vault, path))) {
      if (readNote(deps.vault, path).frontmatter.run === run.run) return;
    }
    const link = receipt ? receiptLink(receipt) : undefined;
    writeNote(deps, {
      path,
      frontmatter: {
        type,
        ...(run.about ? { session: run.about } : {}),
        project: run.project,
        run: run.run,
        ...(link ? { receipt: link } : {}),
      },
      body: `${output.trim()}\n`,
    });
    appendLog(deps, `${landing.said(run)} in [[${path.replace(/\.md$/, '')}]] ${link ?? ''}`);
  });
  return path;
}
