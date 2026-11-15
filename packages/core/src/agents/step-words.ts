// One run of steps in one sentence, in orca's words (native-chat-tool-run-words.ts). The phone and
// the app's chat both show a run this way, so it lives here; each reads its steps in its own shape.

/** What a run needs of a step: the phone's rows and the transcript's steps both fit. */
export type RunStep =
  | { type: 'tool'; kind: string }
  | { type: 'edit'; path: string }
  | { type: 'thought' };

/** A tool kind's past-tense verb and its run clause's noun. */
const KINDS: Record<string, { done: string; noun: [string, string] }> = {
  read: { done: 'Read', noun: ['file', 'files'] },
  search: { done: 'Searched', noun: ['time', 'times'] },
  list: { done: 'Listed', noun: ['folder', 'folders'] },
  command: { done: 'Ran', noun: ['command', 'commands'] },
  web: { done: 'Searched the web', noun: ['time', 'times'] },
  agent: { done: 'Ran', noun: ['agent', 'agents'] },
  plan: { done: 'Updated the plan', noun: ['time', 'times'] },
};
const OTHER = { done: 'Used', noun: ['tool', 'tools'] as [string, string] };

const counted = (verb: string, count: number, [one, many]: [string, string]) =>
  `${verb} ${count} ${count === 1 ? one : many}`;

/**
 * A run of steps in one sentence, its clauses in the order their kinds first appear: "Ran 2
 * commands, edited 1 file, thought".
 */
export function runSentence(steps: RunStep[]): string {
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
    const kind = KINDS[key] ?? OTHER;
    return key === 'plan' && count === 1 ? kind.done : counted(kind.done, count, kind.noun);
  });
  return words
    .map((clause, at) => (at ? clause.charAt(0).toLowerCase() + clause.slice(1) : clause))
    .join(', ');
}
