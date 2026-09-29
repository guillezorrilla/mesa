import { createHash } from 'node:crypto';
import { claudeTranscripts } from '../agents/claude/paths.js';
import { transcriptFile } from '../agents/claude/transcripts.js';
import { rolloutForThread } from '../agents/codex/rollouts.js';
import type { Env } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { SavedReview } from './reviews.js';
import { messageIn, tailLines } from './search.js';
import type { SessionStore } from './store.js';

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
  at?: string;
  truncated: boolean;
};

export type SessionResponses = {
  rows: NativeResponse[];
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

/** Recent native assistant messages, with exact source and text revisions for later review. */
export function sessionResponses(deps: ResponseDeps, id: string): SessionResponses {
  const record = deps.store.get(id);
  const reviews = record.events.filter((event): event is SavedReview => event.type === 'review');
  if (record.kind !== 'interactive' || record.agent === 'terminal')
    throw new MesaError('usage', `session ${id} has no interactive agent responses`);
  if (record.agent === 'antigravity')
    return {
      rows: [],
      reviews,
      truncated: false,
      unavailable: 'Antigravity response transcripts are not qualified',
    };
  if (!record.agentSessionId)
    return {
      rows: [],
      reviews,
      truncated: false,
      unavailable: 'Native conversation ID is not available yet',
    };
  const file =
    record.agent === 'claude'
      ? transcriptFile(claudeTranscripts(deps.home), record.agentSessionId)
      : rolloutForThread(deps, record.agentSessionId);
  if (!file)
    return {
      rows: [],
      reviews,
      truncated: false,
      unavailable: 'Native transcript is not available',
    };
  const { lines, truncated } = tailLines(file);
  const rows: NativeResponse[] = [];
  for (let i = lines.length - 1; i >= 0 && rows.length < MAX_RESPONSES; i--) {
    const line = lines[i];
    if (!line) continue;
    const message = messageIn(record.agent, line);
    if (message?.role !== 'assistant') continue;
    const text = message.text.slice(0, MAX_TEXT);
    rows.push({
      profile: deps.profile,
      session: id,
      agent: record.agent,
      nativeSessionId: record.agentSessionId,
      source: sha(line),
      revision: sha(message.text),
      text,
      ...(message.at ? { at: message.at } : {}),
      truncated: message.text.length > MAX_TEXT,
    });
  }
  return { rows, reviews, truncated: truncated || rows.length === MAX_RESPONSES };
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
