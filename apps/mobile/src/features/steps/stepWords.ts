import { clip, type PhoneStep } from '@mesa/core/phone';

// How a step reads on its row, in orca's words (native-chat-tool-row-verb-copy.ts,
// native-chat-tool-run-words.ts): a verb and a target per step, a sentence per run of steps.

/** A tool kind's verb while running and once done, and its run clause's noun. */
const KINDS: Record<string, { running: string; done: string; noun: [string, string] }> = {
  read: { running: 'Reading', done: 'Read', noun: ['file', 'files'] },
  search: { running: 'Searching', done: 'Searched', noun: ['time', 'times'] },
  list: { running: 'Listing', done: 'Listed', noun: ['folder', 'folders'] },
  command: { running: 'Running', done: 'Ran', noun: ['command', 'commands'] },
  web: { running: 'Searching the web', done: 'Searched the web', noun: ['time', 'times'] },
  agent: { running: 'Running', done: 'Ran', noun: ['agent', 'agents'] },
  plan: { running: 'Updating the plan', done: 'Updated the plan', noun: ['time', 'times'] },
};
const OTHER = { running: 'Using', done: 'Used', noun: ['tool', 'tools'] as [string, string] };

const kindOf = (kind: string) => KINDS[kind] ?? OTHER;

/** A step's row: its verb, and what it acted on (a path, a command, a thought's first line). */
export function stepLabel(step: PhoneStep): { verb: string; target: string } {
  if (step.type === 'thought') return { verb: 'Thought', target: step.line };
  if (step.type === 'edit')
    return { verb: step.status === 'running' ? 'Editing' : 'Edited', target: step.path };
  const words = kindOf(step.kind);
  const verb = step.status === 'running' ? words.running : words.done;
  const named = step.kind === 'agent' || !KINDS[step.kind];
  return { verb, target: step.target || (named ? step.name : '') };
}

/** How many characters of the live line's target show before it is cut. */
export const LIVE_CHARS = 60;

/**
 * What a working agent is doing now, as orca's live line says it (#1153): its current step's
 * verb and target, a long command cut to its first line and LIVE_CHARS characters; "Thinking"
 * after a thought, and "Working" when the Mac names no step (an older Mac, or between steps).
 */
export function liveWords(step?: PhoneStep): { verb: string; target: string } {
  if (!step) return { verb: 'Working', target: '' };
  if (step.type === 'thought') return { verb: 'Thinking', target: '' };
  const { verb, target } = stepLabel(step);
  return { verb, target: clip(target.split('\n')[0]?.trim() ?? '', LIVE_CHARS) };
}

const counted = (verb: string, count: number, [one, many]: [string, string]) =>
  `${verb} ${count} ${count === 1 ? one : many}`;

/**
 * A run of steps in one sentence, its clauses in the order their kinds first appear: "Ran 2
 * commands, edited 1 file, thought".
 */
export function runSentence(steps: PhoneStep[]): string {
  const clauses = new Map<string, number>();
  const edited = new Set<string>();
  for (const step of steps) {
    const key = step.type === 'tool' ? (KINDS[step.kind] ? step.kind : 'other') : step.type;
    if (step.type === 'edit') edited.add(step.path);
    clauses.set(key, (clauses.get(key) ?? 0) + 1);
  }
  const words = [...clauses].map(([key, count]) => {
    if (key === 'edit') return counted('Edited', edited.size, ['file', 'files']);
    if (key === 'thought') return count === 1 ? 'Thought' : `Thought ${count} times`;
    const kind = kindOf(key);
    return key === 'plan' && count === 1 ? kind.done : counted(kind.done, count, kind.noun);
  });
  return words
    .map((clause, at) => (at ? clause.charAt(0).toLowerCase() + clause.slice(1) : clause))
    .join(', ');
}

/** A tool call or an edit that failed; a thought never does. */
export const failed = (step: PhoneStep) => step.type !== 'thought' && step.status === 'failed';

/** A tool call or an edit still running. */
export const running = (step: PhoneStep) => step.type !== 'thought' && step.status === 'running';

/** How many lines of a step's text show before "Show all". */
export const SHOWN_LINES = 40;

/** A step's text cut to its first `SHOWN_LINES` lines, and how many more it has. */
export function shownText(text: string, all: boolean) {
  const lines = text.replace(/\n+$/, '').split('\n');
  if (all || lines.length <= SHOWN_LINES) return { text: lines.join('\n'), more: 0 };
  return { text: lines.slice(0, SHOWN_LINES).join('\n'), more: lines.length - SHOWN_LINES };
}
