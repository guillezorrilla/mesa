import type { Guarded, Override } from '../../decisions/guardrail.js';
import { MesaError } from '../../lib/result.js';
import { typeable } from '../../lib/untrusted-text.js';
import { projectScope } from '../record/general.js';
import { sessionEnded } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import type { Caller } from '../window/caller.js';
import { windowOf } from '../window/window-name.js';
import { isTerminalKey } from './terminal-keys.js';

type TerminalDeps = {
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'findWindow' | 'sendText' | 'pressKey'>;
  caller: () => Caller;
};

export type TypedLine = {
  typed: true;
  session: string;
  project: string;
  chars: number;
  override?: Override;
};

/**
 * A live plain terminal session's window, which only a person types into: any Mesa window is an
 * agent's (ADR-0003), and an agent session takes `mesa send` instead, so a review or a note is
 * never typed into a shell.
 */
async function terminalWindow(deps: TerminalDeps, id: string) {
  if (deps.caller().inMesaWindow)
    throw new MesaError('usage', `only a person types into a terminal (mesa attach ${id})`);
  const record = deps.store.get(id);
  if (record.agent !== 'terminal')
    throw new MesaError('usage', `session ${id} runs an agent; mesa send types into it`);
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (record.endedAt || !pane || pane.dead) throw sessionEnded();
  return { record, target };
}

/**
 * Types `line` into plain terminal session `id`, then Enter, once `guard` (the guardrail, with the
 * caller's overrides) lets it: a shell runs what it is given, so the text is checked as a send is.
 */
export async function typeLine(
  deps: TerminalDeps & { guard: (action: Guarded) => Promise<Override | undefined> },
  id: string,
  line: string,
): Promise<TypedLine> {
  const typed = typeable(line);
  if (!typed.trim()) throw new MesaError('usage', 'nothing to type: the line is empty');
  const { record, target } = await terminalWindow(deps, id);
  const override = await deps.guard({
    action: 'send',
    target: id,
    text: typed,
    project: projectScope(record.project),
  });
  await deps.tmux.sendText(target, typed, { force: true });
  return {
    typed: true,
    session: id,
    project: record.project,
    chars: Array.from(typed).length,
    ...(override ? { override } : {}),
  };
}

/**
 * Presses `keys` in plain terminal session `id`, in order, each by its tmux name (terminal-keys):
 * they carry no text, so the guardrail has nothing to read.
 */
export async function pressKeys(deps: TerminalDeps, id: string, keys: readonly string[]) {
  const bad = keys.filter((key) => !isTerminalKey(key));
  if (!keys.length || bad.length)
    throw new MesaError(
      'usage',
      `${bad.length ? `unknown keys ${bad.join(', ')}` : 'no keys'}: pass Escape, Tab, Enter, Up, Down, Left, Right or C-<letter>`,
    );
  const { target } = await terminalWindow(deps, id);
  for (const key of keys) await deps.tmux.pressKey(target, key);
  return { session: id, keys: [...keys] };
}
