import { WORKTREE_SCRIPTS, type WorktreeScript } from '../projects/trust.js';

/**
 * Why a setup or teardown argv whose program is a whole command line (`["node --test test/"]`)
 * fails: the list is argv, run without a shell, so that string is one program name. Its split
 * form, or none for an argv whose program has no whitespace. A program path may hold a space, so
 * this warns and never refuses.
 */
export function oneStringHint(argv: readonly string[]): string | undefined {
  const program = argv[0]?.trim();
  if (!program || !/\s/.test(program)) return undefined;
  const split = [...program.split(/\s+/), ...argv.slice(1)];
  return `the list is argv, run without a shell, so ${JSON.stringify(program)} is one program name; write it as [${split.join(', ')}]`;
}

/** The hint for each of `scripts` written as one string, named and joined; none when all are argv. */
export function scriptHints(scripts: Partial<Record<WorktreeScript, readonly string[]>>) {
  const hints = WORKTREE_SCRIPTS.flatMap((kind) => {
    const hint = oneStringHint(scripts[kind] ?? []);
    return hint ? [`worktrees.${kind}: ${hint}`] : [];
  });
  return hints.length ? hints.join('; ') : undefined;
}
