import type { TranscriptMessage } from './transcripts.js';

// What an agent did between its messages, read from its transcript beside them (#1143): its tool
// calls, its file edits and its reasoning, as orca's chat shows them. Each agent's own lines are
// read under agents/<agent>/steps.ts; this file holds the shapes and the pass they share.

/** What a tool call did, by the kind of work, as orca's chat words and draws it. */
export type ToolKind = 'read' | 'search' | 'list' | 'command' | 'web' | 'agent' | 'plan' | 'other';

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
      status: 'running' | 'done' | 'failed';
      output: string;
    }
  | {
      type: 'edit';
      id: string;
      path: string;
      added: number;
      removed: number;
      hunk: string[];
      status: 'running' | 'done' | 'failed';
    }
  | { type: 'thought'; id: string; text: string };

/** What one transcript line says about steps: steps it starts, and results of earlier ones. */
export type StepEvent =
  | { start: TranscriptStep }
  | { result: { id: string; failed: boolean; output: string } };

/** A step and how many of the transcript's messages come before it. */
export type PlacedStep = { step: TranscriptStep; before: number };

/** How much of a tool's output or a hunk a step keeps. */
export const STEP_TEXT = 32 << 10;

const keep = (text: string) => text.slice(0, STEP_TEXT);

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
    ].slice(0, 2000),
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
      const step = byId.get(event.result.id);
      if (!step || step.type === 'thought') continue;
      step.status = event.result.failed ? 'failed' : 'done';
      if (step.type === 'tool') step.output = keep(event.result.output);
    }
    const message = messageIn(line, index);
    if (message) messages.push(message);
  });
  return { messages, steps };
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
