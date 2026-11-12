import { AGENTS } from '../../agents/agents.js';
import { MesaError } from '../../lib/result.js';
import { typeable } from '../../lib/untrusted-text.js';
import type { TmuxBackend } from '../tmux/backend.js';
import type { Caller } from '../window/caller.js';
import { type PendingPrompt, type PromptDeps, readPrompt } from './pending.js';

/** An answer: one of the prompt's options, or typed text where it takes one. */
export type AnswerChoice = {
  option?: string;
  text?: string;
  /** The prompt's id as `mesa prompt` gave it; another prompt waiting now refuses the answer. */
  prompt?: string;
};

export type Answered = {
  answered: true;
  session: string;
  project: string;
  prompt: string;
  kind: Extract<PendingPrompt, { status: 'pending' }>['kind'];
  summary: string;
  /** The option chosen, or none for a typed answer. */
  option?: string;
  /** The option's label, or the typed text. */
  answer: string;
};

const usage = (message: string) => new MesaError('usage', message);

/**
 * Answers session `id`'s pending prompt as a person (ADR-0003): refused for an agent caller, and
 * as stale when the session no longer waits on that prompt (answered in the pane, or replaced).
 * Then it presses the option's keys, or opens the typed answer and types `text` with Enter.
 */
export async function answerPrompt(
  deps: PromptDeps & {
    tmux: Pick<TmuxBackend, 'findWindow' | 'capturePane' | 'pressKey' | 'sendText'>;
    caller: () => Caller;
  },
  id: string,
  choice: AnswerChoice,
): Promise<Answered> {
  const caller = deps.caller();
  if (caller.session || caller.inMesaWindow) {
    throw usage(`only a person answers a prompt; answer it there (mesa attach ${id})`);
  }
  if ((choice.option === undefined) === (choice.text === undefined)) {
    throw usage('pass an option or --text, not both');
  }
  const text = choice.text === undefined ? undefined : typeable(choice.text);
  if (text !== undefined && !text.trim()) throw usage('nothing to answer: the text is empty');
  const read = await readPrompt(deps, id);
  const { prompt, target } = read;
  if (!prompt || !read.id) {
    throw usage(`stale answer: session ${id} waits on no prompt Mesa can answer now`);
  }
  if (choice.prompt !== undefined && choice.prompt !== read.id) {
    throw usage(`stale answer: session ${id} now waits on another prompt (see mesa prompt ${id})`);
  }
  const done = { answered: true as const, session: id, project: read.project, prompt: read.id };
  const about = { kind: prompt.kind, summary: prompt.summary };
  if (text !== undefined) {
    if (!prompt.freeText) throw usage(`this prompt takes no typed answer; choose an option`);
    for (const key of prompt.freeText) await deps.tmux.pressKey(target, key);
    const { submitDelayMs } = AGENTS[read.agent];
    await deps.tmux.sendText(target, text, { submitDelayMs });
    return { ...done, ...about, answer: text };
  }
  const option = prompt.options.find((o) => o.id === choice.option);
  if (!option) {
    const ids = prompt.options.map((o) => o.id).join(', ');
    throw usage(`no option ${choice.option} on this prompt; choose one of: ${ids}`);
  }
  for (const key of option.keys) await deps.tmux.pressKey(target, key);
  return { ...done, ...about, option: option.id, answer: option.label };
}
