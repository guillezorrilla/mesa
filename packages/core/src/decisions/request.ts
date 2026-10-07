import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import type { SessionRecord } from '../sessions/record/record.js';
import type { SessionStore } from '../sessions/record/store.js';
import { misfit } from '../vault/mount/tools.js';
import { adviceText } from './advice.js';
import { type ScopedContext, scopedContext } from './context.js';
import type { AssistMode, Evaluation } from './evaluate.js';
import {
  evidencePacket,
  MAX_EVENTS,
  MAX_STEPS,
  nextStepPacket,
  PACKET_CHARS,
  type Packet,
  STEP_ID,
} from './packet.js';

// A decision request (CONTEXT.md, Decision assistance): the one input the decision_evaluate tool
// and `mesa decisions evaluate|context|advise` share, so both answer alike. Its schema bounds
// every field; the session's saved goal comes from its record, never from the request.

const LINE = 300;

/** The sites a session may ask about; supervision is the Board's. */
export const REQUEST_SITES = ['relevance', 'next-step', 'evidence'] as const;

export const DecisionRequestSchema = z.strictObject({
  site: z.enum(REQUEST_SITES).describe('relevance, next-step or evidence'),
  query: z.string().max(500).optional().describe('relevance: what to find (default: the goal)'),
  candidates: z
    .array(
      z.strictObject({
        id: z.string().regex(STEP_ID).describe('A short slug'),
        step: z.string().max(LINE),
      }),
    )
    .min(1)
    .max(MAX_STEPS)
    .optional()
    .describe('next-step: the steps to choose from'),
  events: z.array(z.string().max(LINE)).max(MAX_EVENTS).optional().describe('next-step: recent'),
  attempts: z.array(z.string().max(LINE)).max(MAX_EVENTS).optional().describe('next-step: tried'),
  claim: z.string().max(500).optional().describe('evidence: the completion claim'),
  evidence: z.string().max(PACKET_CHARS).optional().describe('evidence: what shows it'),
});
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;

/** Advice at next-step or evidence: the evaluation and the fixed words around it. */
export type Advice = {
  session: string;
  site: Evaluation['site'];
  evaluation: Evaluation;
  advice: string;
};

export type DecisionAnswer = ScopedContext | Advice;

/** `raw` as a request, or a usage error naming every field it gets wrong. */
export function decisionRequest(raw: unknown): DecisionRequest {
  const parsed = DecisionRequestSchema.safeParse(raw);
  if (!parsed.success) throw new MesaError('usage', `decision request: ${misfit(parsed.error)}`);
  return parsed.data;
}

/** The packet a next-step or evidence request makes; a missing field is usage. */
function packetOf(session: SessionRecord, request: DecisionRequest): Packet {
  if (request.site === 'evidence') {
    if (request.claim === undefined || request.evidence === undefined)
      throw new MesaError('usage', 'evidence needs a claim and the evidence for it');
    return evidencePacket(request.claim, request.evidence);
  }
  if (!request.candidates) throw new MesaError('usage', 'next-step needs candidates');
  return nextStepPacket({
    goal: session.goal ?? 'none saved',
    events: request.events ?? [],
    attempts: request.attempts ?? [],
    candidates: request.candidates,
  });
}

/**
 * Answers `request` for `session`: its scoped context at relevance (for the query, else its saved
 * goal), or advice at next-step or evidence; `run` evaluates a packet.
 */
export async function answerRequest(
  deps: { vault: string; store: SessionStore },
  session: SessionRecord,
  request: DecisionRequest,
  run: (packet: Packet, revision?: string) => Promise<Evaluation>,
  mode: AssistMode,
): Promise<DecisionAnswer> {
  if (request.site === 'relevance') {
    const query = request.query?.trim() || session.goal?.trim();
    if (!query) throw new MesaError('usage', 'relevance needs a query: the session saved no goal');
    return scopedContext(deps, session, query, run, mode);
  }
  const evaluation = await run(packetOf(session, request));
  return { session: session.id, site: request.site, evaluation, advice: adviceText(evaluation) };
}
