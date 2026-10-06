import type { AgentState } from '../states.js';

// Codex's TUI screen, read from the tail patterns of docs/spikes/codex.md (codex-cli 0.154.0 in a
// Mesa-style tmux window), at the tail's 0.6 (ADR-0003): read only when no hook or listing speaks.

/** The screens that stop a codex before its prompt, which only a person gets past. */
const GATES = [
  // Folder trust, on the first start in a folder.
  'do you trust the contents of this directory?',
  // Hook review, after hooks are added or changed: the prompt, and the list behind it.
  'hooks need review',
  // A resume from another folder than the session's, without -C.
  'choose working directory to resume this session',
];

/** The approval dialog for a command, and the line under each approval. */
const PERMISSION = [
  'would you like to run the following command?',
  'press enter to confirm or esc to cancel',
];

/** The status line while a turn runs; the composer's placeholder stays on screen under it. */
const STATUS = '• working (';
const WORKING = [STATUS, 'esc to interrupt'];

/** The composer's placeholder, shown while it is empty. */
const IDLE = '› ask codex to do anything';

/**
 * Codex's screen read as a state, or none when it shows nothing that says one. A startup gate
 * needs a person, the nearest Mesa state being `waiting-question`; the working marker is checked
 * before the idle placeholder, which stays on screen while a turn runs.
 */
export function codexScreenState(tail: string): AgentState | undefined {
  const lower = tail.toLowerCase();
  const shows = (texts: readonly string[]) => texts.some((t) => lower.includes(t));
  if (shows(GATES)) return 'waiting-question';
  if (shows(PERMISSION)) return 'waiting-permission';
  if (shows(WORKING)) return 'working';
  if (lower.includes(IDLE)) return 'idle';
  return undefined;
}

/** A line of the transcript: the agent's messages and actions, and Codex's own notes. */
const ITEM = /^• /;

// ponytail: 200 characters, as the hook log keeps; the board shows one line.
/**
 * The board's "last output": the last transcript line (`• `) above the composer (its last `› `
 * line, the prompt or a dialog's choice), the status line left out.
 */
export function codexLastOutputLine(tail: string): string | undefined {
  const lines = tail.split('\n').map((l) => l.trim());
  const composer = lines.reduce((at, l, i) => (l.startsWith('› ') ? i : at), lines.length);
  const line = lines
    .slice(0, composer)
    .filter((l) => ITEM.test(l) && !l.toLowerCase().startsWith(STATUS))
    .at(-1);
  return line && Array.from(line).slice(0, 200).join('');
}
