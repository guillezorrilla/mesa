// The actions a Structured session's chat follow (`mesa chat --follow`, ADR-0029) runs for it in
// its own process, so the app's chat acts on the session without starting another mesa.

/** The commands a follow runs, by their words: the ones Chat (beta) calls on its session. */
const FOLLOW_ACTIONS = [
  ['send'],
  ['answer'],
  ['prompt'],
  ['sessions', 'model'],
  ['sessions', 'mode'],
  ['sessions', 'controls'],
  ['sessions', 'config'],
];

/**
 * The session `argv` acts on when it is one of the follow's actions (`--json` and flags before
 * `--`, the session right after it); none for another command.
 */
export function followedSession(argv: readonly string[]): string | undefined {
  const words = argv[0] === '--json' ? argv.slice(1) : argv;
  const end = words.indexOf('--');
  if (end < 0 || !FOLLOW_ACTIONS.some((name) => name.every((word, i) => words[i] === word)))
    return undefined;
  return words[end + 1];
}
