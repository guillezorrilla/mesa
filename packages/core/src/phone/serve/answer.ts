import { MesaError } from '../../lib/result.js';
import { type AnswerChoice, isStale } from '../../sessions/answer/answer.js';
import type { PendingPrompt } from '../../sessions/answer/pending.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import type { SessionResponses } from '../../sessions/native/responses.js';
import type { UsageReport } from '../../usage/records.js';
import type { CallResult, PhoneCall } from '../protocol/rpc.js';
import { type AutomationDeps, answerAutomationCall, isAutomationCall } from './automations.js';
import { answerCrewCall, type CrewDeps, isCrewCall } from './crew.js';
import { answerInboxCall, type InboxDeps, isInboxCall } from './inbox.js';
import { answerPushes, type PushesDeps } from './pushes.js';
import { replySegments } from './replies.js';
import { askedRows, phoneRows, toPhoneRow } from './rows.js';
import { phoneUsage } from './usage.js';

/** The session functions the CLI uses, which every phone call goes through. */
export type AnswerDeps = {
  board: () => Promise<SessionRow[]>;
  responses: (id: string) => SessionResponses;
  logs: (id: string, tail: number) => { lines: string[] };
  read: (ids: readonly string[]) => unknown;
  unread: (ids: readonly string[]) => unknown;
  prompt: (id: string) => Promise<PendingPrompt>;
  /** Answers as the person, from the phone. */
  answer: (id: string, choice: AnswerChoice) => Promise<unknown>;
  crew: CrewDeps;
  automations: AutomationDeps;
  inbox: InboxDeps;
  /** `mesa usage`'s report. */
  usage: () => Promise<UsageReport>;
  pushes: PushesDeps;
};

/** How many replies and output lines the session screen gets. */
const REPLIES = 5;
const TAIL = 60;

/** Answers one call from the phone; throws a MesaError (not_found) for an unknown session. */
export async function answerCall(deps: AnswerDeps, call: PhoneCall): Promise<unknown> {
  if (call.method === 'sessions')
    return {
      rows: await askedRows(phoneRows(await deps.board()), deps.prompt),
    } satisfies CallResult<'sessions'>;
  if (isCrewCall(call)) return answerCrewCall(deps.crew, call);
  if (isAutomationCall(call)) return answerAutomationCall(deps.automations, call);
  if (isInboxCall(call)) return answerInboxCall(deps.inbox, call);
  if (call.method === 'usage')
    return phoneUsage(
      await deps.usage(),
      phoneRows(await deps.board()),
    ) satisfies CallResult<'usage'>;
  if (call.method === 'pushes')
    return answerPushes(deps.pushes, call.set) satisfies CallResult<'pushes'>;
  if (call.method === 'mark') {
    (call.unread ? deps.unread : deps.read)([call.id]);
    return {} satisfies CallResult<'mark'>;
  }
  if (call.method === 'prompt') {
    const { session: _, ...prompt } = await deps.prompt(call.id);
    return prompt satisfies CallResult<'prompt'>;
  }
  if (call.method === 'answer') {
    const { id, prompt, option, text } = call;
    return deps.answer(id, { option, text, prompt }).then(
      (): CallResult<'answer'> => ({ status: 'answered' }),
      (error) => {
        if (isStale(error)) return { status: 'stale' } satisfies CallResult<'answer'>;
        throw error;
      },
    );
  }
  const row = (await deps.board()).find((r) => r.id === call.id);
  if (!row?.managed) throw new MesaError('not_found', `no session ${call.id}`);
  // Newest first, as `review responses` lists them.
  const replies = deps.responses(call.id).rows.slice(0, REPLIES);
  return {
    row: toPhoneRow(row),
    goal: row.goal ?? null,
    replies: replies.map((reply) => ({
      id: reply.revision,
      at: reply.at ?? null,
      segments: replySegments(reply.text),
    })),
    tail: deps.logs(call.id, TAIL).lines,
  } satisfies CallResult<'session'>;
}
