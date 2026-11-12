import { createHash } from 'node:crypto';
import { AGENTS } from '../../agents/agents.js';
import type { AgentPrompt, PromptEvent } from '../../agents/prompt.js';
import { MesaError } from '../../lib/result.js';
import { refuseRun, sessionEnded } from '../record/record.js';
import { WAITING_STATES } from '../record/states.js';
import type { SessionStore } from '../record/store.js';
import { parentHook, readHookEvents } from '../signals/hook-events.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { windowOf } from '../window/window-name.js';

// The permission or question a session's agent waits on (CONTEXT.md, Pending prompt), read from
// its last hook event and its pane's tail by its agent's reader (AGENTS[agent].prompt).

/** One answer a pending prompt offers. */
export type PromptOption = { id: string; label: string; description?: string };

/** What `mesa prompt` prints: the prompt with its answers, or why Mesa cannot answer it. */
export type PendingPrompt =
  | {
      status: 'pending';
      session: string;
      /** Names this prompt: an answer given for another one is refused as stale. */
      id: string;
      kind: AgentPrompt['kind'];
      tool?: string;
      summary: string;
      options: PromptOption[];
      /** It takes a typed answer too (`mesa answer --text`). */
      freeText: boolean;
    }
  | { status: 'unsupported'; session: string; reason: string };

export type PromptDeps = {
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'findWindow' | 'capturePane'>;
  eventsDir: string;
};

// ponytail: what the readers check sits at a dialog's bottom; only Codex's `$ command` line can
// scroll above 40 lines, and then its summary is the tool's name.
const TAIL_LINES = 40;
// ponytail: the hook log's last 64 KB holds the event before any prompt.
const EVENT_BYTES = 64 * 1024;

/** The last parent hook event, Notifications aside: they follow a prompt and say nothing of it. */
const lastEvent = (eventsDir: string, id: string): PromptEvent | undefined =>
  readHookEvents(eventsDir, id, EVENT_BYTES)
    .filter((e) => parentHook(e) && e.event !== 'Notification')
    .at(-1);

/** The prompt's id: the hook event before it and what it asks, so a new prompt gets a new one. */
const promptId = (event: PromptEvent | undefined, prompt: AgentPrompt) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        event?.at ?? null,
        prompt.kind,
        prompt.summary,
        prompt.options.map((o) => o.label),
      ]),
    )
    .digest('hex')
    .slice(0, 12);

/**
 * The prompt session `id`'s pane shows now, as its agent's reader sees it, with its id and the
 * window to answer it in; no prompt when the pane shows none the reader qualifies. `waiting`: the
 * screen shows a wait, or says nothing and the record was last placed in one.
 */
export async function readPrompt(deps: PromptDeps, id: string) {
  const record = deps.store.get(id);
  if (record.agent === 'terminal') {
    throw new MesaError('usage', `session ${id} is a plain terminal; it waits on no agent prompt`);
  }
  const { agent } = record;
  refuseRun(record, 'waits on no prompt');
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (!pane || pane.dead) throw sessionEnded();
  const event = lastEvent(deps.eventsDir, id);
  const tail = await deps.tmux.capturePane(target, TAIL_LINES);
  const { prompt: reader, screen } = AGENTS[agent];
  const prompt = reader?.(tail, event);
  const waiting = WAITING_STATES.has(screen.state(tail) ?? record.lastState.state);
  return {
    agent,
    project: record.project,
    target,
    prompt,
    waiting,
    id: prompt ? promptId(event, prompt) : undefined,
  };
}

/**
 * Session `id`'s pending prompt with its answers, or `unsupported` when it waits on one its agent's
 * reader does not qualify; a usage error when it waits on none.
 */
export async function pendingPrompt(deps: PromptDeps, id: string): Promise<PendingPrompt> {
  const { prompt, waiting, id: promptKey } = await readPrompt(deps, id);
  if (prompt && promptKey) {
    return {
      status: 'pending',
      session: id,
      id: promptKey,
      kind: prompt.kind,
      ...(prompt.tool ? { tool: prompt.tool } : {}),
      summary: prompt.summary,
      options: prompt.options.map(({ keys: _, ...option }) => option),
      freeText: Boolean(prompt.freeText),
    };
  }
  if (waiting) {
    return {
      status: 'unsupported',
      session: id,
      reason: `Mesa cannot answer this prompt; answer it in the pane (mesa attach ${id})`,
    };
  }
  throw new MesaError('usage', `session ${id} is not waiting on a prompt`);
}
