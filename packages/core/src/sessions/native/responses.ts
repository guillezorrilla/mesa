import { createHash } from 'node:crypto';
import { AGENTS } from '../../agents/agents.js';
import { currentStep, type TranscriptStep } from '../../agents/steps.js';
import { promptOf } from '../../agents/transcripts.js';
import { closesFence, opensFence } from '../../lib/code-fence.js';
import type { Env } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import type { SavedReview } from '../input/reviews.js';
import type { SessionStore } from '../record/store.js';

const MAX_RESPONSES = 30;
const MAX_TEXT = 64 << 10;
const MAX_PASSAGE = 8 << 10;
const MAX_COMMENT = 4 << 10;

type ResponseDeps = { profile: string; store: SessionStore; home: string; env: Env };
type ReviewInput = {
  profile: string;
  source: string;
  revision: string;
  start: number;
  end: number;
  comment: string;
};
export type NativeResponse = {
  profile: string;
  session: string;
  agent: 'claude' | 'codex';
  nativeSessionId: string;
  source: string;
  revision: string;
  text: string;
  /** Each fenced block's contents, for copying on its own (`replyBlocks`). */
  blocks: string[];
  at?: string;
  truncated: boolean;
};

/**
 * A prompt the person wrote among the responses: its text's revision, its text, when, and how many
 * of the responses are newer than it, which places it among them.
 */
export type NativePrompt = { revision: string; text: string; at?: string; newer: number };

/** A step the agent took among the responses (agents/steps.ts), placed as a prompt is. */
export type NativeStep = TranscriptStep & { newer: number };

export type SessionResponses = {
  rows: NativeResponse[];
  /** The person's prompts from the newest message back to the oldest response read, newest first. */
  prompts: NativePrompt[];
  /** What the agent did among the responses read, newest first. */
  steps: NativeStep[];
  /** The id of the step the agent is on now (currentStep), none when it is on none. */
  current?: string;
  reviews: SavedReview[];
  truncated: boolean;
  unavailable?: string;
};

export type ResponseReviewPreview = {
  id: string;
  target: string;
  source: string;
  revision: string;
  passage: string;
  comment: string;
  prompt: string;
};

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * The contents of each fenced block in a reply, in order, without the opening fence's indentation;
 * a blank one is left out. An unclosed one runs to the end, unless the reply was `cut` short, when
 * it may be only part of a block and is left out too.
 */
export function replyBlocks(text: string, cut = false): string[] {
  const blocks: string[] = [];
  let open: { marker: string; indent: string } | undefined;
  let lines: string[] = [];
  for (const line of text.split('\n')) {
    if (!open) open = opensFence(line);
    else if (closesFence(line, open.marker)) {
      blocks.push(lines.join('\n'));
      open = undefined;
      lines = [];
    } else
      lines.push(line.startsWith(open.indent) ? line.slice(open.indent.length) : line.trimStart());
  }
  if (open && !cut) blocks.push(lines.join('\n'));
  return blocks.filter((block) => block.trim());
}

/** Recent native assistant messages, with exact source and text revisions for later review. */
export function sessionResponses(deps: ResponseDeps, id: string): SessionResponses {
  const record = deps.store.get(id);
  const reviews = record.events.filter((event): event is SavedReview => event.type === 'review');
  if (record.kind !== 'interactive' || record.agent === 'terminal')
    throw new MesaError('usage', `session ${id} has no interactive agent responses`);
  if (record.agent === 'antigravity')
    return {
      rows: [],
      prompts: [],
      steps: [],
      reviews,
      truncated: false,
      unavailable: 'Antigravity response transcripts are not qualified',
    };
  if (!record.agentSessionId)
    return {
      rows: [],
      prompts: [],
      steps: [],
      reviews,
      truncated: false,
      unavailable: 'Native conversation ID is not available yet',
    };
  const transcripts = AGENTS[record.agent].transcripts;
  const file = transcripts.file(deps, record.agentSessionId);
  if (!file)
    return {
      rows: [],
      prompts: [],
      steps: [],
      reviews,
      truncated: false,
      unavailable: 'Native transcript is not available',
    };
  const { messages, steps: placed, truncated } = transcripts.messages(file);
  const current = currentStep({ messages, steps: placed });
  const rows: NativeResponse[] = [];
  const prompts: NativePrompt[] = [];
  const steps: NativeStep[] = [];
  let next = placed.length - 1;
  for (let i = messages.length - 1; i >= 0 && rows.length < MAX_RESPONSES; i--) {
    // The steps after message i, before the responses read so far.
    for (; next >= 0 && (placed[next]?.before ?? 0) > i; next--) {
      const step = placed[next]?.step;
      if (step) steps.push({ ...step, newer: rows.length });
    }
    const message = messages[i];
    const prompt = message?.role === 'user' && !message.tool && promptOf(message.text);
    if (prompt)
      prompts.push({
        revision: sha(prompt),
        text: prompt.slice(0, MAX_TEXT),
        ...(message.at ? { at: message.at } : {}),
        newer: rows.length,
      });
    if (message?.role !== 'assistant') continue;
    const text = message.text.slice(0, MAX_TEXT);
    const cut = message.text.length > MAX_TEXT;
    rows.push({
      profile: deps.profile,
      session: id,
      agent: record.agent,
      nativeSessionId: record.agentSessionId,
      source: sha(message.line),
      revision: sha(message.text),
      text,
      blocks: replyBlocks(text, cut),
      ...(message.at ? { at: message.at } : {}),
      truncated: cut,
    });
  }
  // Every message read: the steps before the first are older than every response.
  if (rows.length < MAX_RESPONSES)
    for (; next >= 0; next--) {
      const step = placed[next]?.step;
      if (step) steps.push({ ...step, newer: rows.length });
    }
  return {
    rows,
    prompts,
    steps,
    ...(current ? { current } : {}),
    reviews,
    truncated: truncated || rows.length === MAX_RESPONSES,
  };
}

/** Exact passage and comment to be shown before the existing guarded send. */
export function previewResponseReview(
  deps: ResponseDeps,
  id: string,
  input: ReviewInput,
): ResponseReviewPreview {
  if (input.profile !== deps.profile)
    throw new MesaError('usage', 'the response belongs to another Mesa profile');
  const row = sessionResponses(deps, id).rows.find((item) => item.source === input.source);
  if (!row || row.revision !== input.revision)
    throw new MesaError(
      'locked',
      'the response changed or left the recent transcript; choose it again',
    );
  if (
    !Number.isInteger(input.start) ||
    !Number.isInteger(input.end) ||
    input.start < 0 ||
    input.end <= input.start ||
    input.end > row.text.length
  )
    throw new MesaError('usage', 'select a passage from this response');
  const passage = row.text.slice(input.start, input.end);
  if (Buffer.byteLength(passage) > MAX_PASSAGE)
    throw new MesaError('usage', 'selected passage exceeds 8 KiB');
  if (
    !input.comment.trim() ||
    input.comment.includes('\0') ||
    Buffer.byteLength(input.comment) > MAX_COMMENT
  )
    throw new MesaError('usage', 'review comment must be 1-4096 bytes and contain no NUL');
  const prompt = `Review your response in native conversation ${row.nativeSessionId} (source ${row.source.slice(0, 12)}).\nQuoted passage: ${JSON.stringify(passage)}\nComment: ${input.comment}`;
  return {
    id: sha(JSON.stringify([input.source, input.revision, input.start, input.end, input.comment])),
    target: id,
    source: row.source,
    revision: row.revision,
    passage,
    comment: input.comment,
    prompt,
  };
}
