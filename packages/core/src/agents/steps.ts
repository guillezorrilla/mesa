import type { TranscriptMessage } from './transcripts.js';

// What an agent did between its messages, read from its transcript beside them (#1143): its tool
// calls, its file edits and its reasoning, as orca's chat shows them. Each agent's own lines are
// read under agents/<agent>/steps.ts; this file holds the shapes and the pass they share.

/** What a tool call did, by the kind of work, as orca's chat words and draws it. */
export type ToolKind = 'read' | 'search' | 'list' | 'command' | 'web' | 'agent' | 'plan' | 'other';

/** Where a tool call or an edit is: still running, done, or failed. */
export type StepStatus = 'running' | 'done' | 'failed';

/**
 * One step: a tool call (its kind, its tool's name, a one-line target such as a path or a
 * command, whether it failed, and what it printed), an edit of one file (its path, lines added
 * and removed, and the hunk as `+`/`-`/` ` lines), or a passage of reasoning. `id` is stable
 * across reads of the same transcript.
 */
export type TranscriptStep =
  | {
      type: 'tool';
      id: string;
      kind: ToolKind;
      name: string;
      target: string;
      status: StepStatus;
      output: string;
    }
  | {
      type: 'edit';
      id: string;
      path: string;
      added: number;
      removed: number;
      hunk: string[];
      status: StepStatus;
    }
  | { type: 'thought'; id: string; text: string };

/** What one transcript line says about steps: steps it starts, and results of earlier ones. */
export type StepEvent =
  | { start: TranscriptStep }
  | { result: { id: string; failed: boolean; output: string } };

/** A step and how many of the transcript's messages come before it. */
export type PlacedStep = { step: TranscriptStep; before: number };

/** How much of a tool's output or a thought a step keeps, and how many lines of a hunk. */
export const STEP_TEXT = 32 << 10;
export const HUNK_LINES = 2000;

/** `text` cut to what a step keeps, saying so when cut. */
export const keep = (text: string) =>
  text.length > STEP_TEXT
    ? `${text.slice(0, STEP_TEXT)}\n[${text.length - STEP_TEXT} more characters on the Mac]`
    : text;

/** A transcript field as a string, empty when it is none. */
export const stringOf = (value: unknown) => (typeof value === 'string' ? value : '');

/** A one-line target from a longer text: its first non-blank line, trimmed. */
export const firstLine = (text: unknown) =>
  typeof text === 'string' ? (text.split('\n').find((line) => line.trim()) ?? '').trim() : '';

/** An edit replacing `before` with `after` as hunk lines, with its added and removed counts. */
export function editHunk(before: string, after: string) {
  const old = before ? before.split('\n') : [];
  const next = after ? after.split('\n') : [];
  // ponytail: the shared head and tail are kept as context and the middle shown as replaced; a
  // real line diff only if long edits read badly.
  let head = 0;
  while (head < old.length && head < next.length && old[head] === next[head]) head++;
  let tail = 0;
  while (
    tail < old.length - head &&
    tail < next.length - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  )
    tail++;
  const removed = old.slice(head, old.length - tail);
  const added = next.slice(head, next.length - tail);
  return {
    added: added.length,
    removed: removed.length,
    hunk: [
      ...old.slice(0, head).map((line) => ` ${line}`),
      ...removed.map((line) => `-${line}`),
      ...added.map((line) => `+${line}`),
      ...old.slice(old.length - tail).map((line) => ` ${line}`),
    ].slice(0, HUNK_LINES),
  };
}

/**
 * A transcript's messages (`messageIn` per line) and its steps (`eventsIn` per line), in one pass
 * over its lines: each step placed after the messages read before it, its result filled in when
 * a later line brings it.
 */
export function readTurns(
  lines: string[],
  messageIn: (line: string, index: number) => TranscriptMessage | undefined,
  eventsIn: (line: string, index: number) => StepEvent[],
): { messages: TranscriptMessage[]; steps: PlacedStep[] } {
  const messages: TranscriptMessage[] = [];
  const steps: PlacedStep[] = [];
  const byId = new Map<string, TranscriptStep>();
  lines.forEach((line, index) => {
    for (const event of eventsIn(line, index)) {
      if ('start' in event) {
        byId.set(event.start.id, event.start);
        steps.push({ step: event.start, before: messages.length });
        continue;
      }
      // One call's result finishes each step it started (a patch's edits are `<id>:<n>`).
      const { id } = event.result;
      for (const [key, step] of byId) {
        if ((key !== id && !key.startsWith(`${id}:`)) || step.type === 'thought') continue;
        step.status = event.result.failed ? 'failed' : 'done';
        if (step.type === 'tool') step.output = keep(event.result.output);
      }
    }
    const message = messageIn(line, index);
    if (message) messages.push(message);
  });
  return { messages, steps };
}

/**
 * The step an agent is on now (#1153), as orca's live line reads it: the last step read, when
 * nothing was said after it and it is a tool call or edit with no result yet, or a thought the
 * agent goes on from; none otherwise, as after a result or a prompt.
 */
export function currentStep(turns: { messages: unknown[]; steps: PlacedStep[] }) {
  const last = turns.steps.at(-1);
  if (!last || last.before < turns.messages.length) return undefined;
  const { step } = last;
  return step.type === 'thought' || step.status === 'running' ? step.id : undefined;
}

/** A tool result's text: its string, or its text blocks' joined. */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return keep(content);
  if (!Array.isArray(content)) return '';
  return keep(
    content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .filter(Boolean)
      .join('\n'),
  );
}
