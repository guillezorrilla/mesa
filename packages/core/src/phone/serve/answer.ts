import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import type { SessionResponses } from '../../sessions/native/responses.js';
import type { CallResult, PhoneCall } from '../protocol/rpc.js';
import { replySegments } from './replies.js';
import { phoneRows, toPhoneRow } from './rows.js';
import { answerSteer, isSteerCall, type SteerDeps } from './steer.js';

/** The session functions the CLI uses, which every phone call goes through. */
export type AnswerDeps = {
  board: () => Promise<SessionRow[]>;
  responses: (id: string) => SessionResponses;
  logs: (id: string, tail: number) => { lines: string[] };
  read: (ids: readonly string[]) => unknown;
  unread: (ids: readonly string[]) => unknown;
  steer: SteerDeps;
};

/** How many replies and output lines the session screen gets. */
const REPLIES = 5;
const TAIL = 60;

/** Answers one call from the phone; throws a MesaError (not_found) for an unknown session. */
export async function answerCall(deps: AnswerDeps, call: PhoneCall): Promise<unknown> {
  if (call.method === 'sessions')
    return { rows: phoneRows(await deps.board()) } satisfies CallResult<'sessions'>;
  if (call.method === 'mark') {
    (call.unread ? deps.unread : deps.read)([call.id]);
    return {} satisfies CallResult<'mark'>;
  }
  /** The session the call names, as the board has it now. */
  const managed = async (id: string) => {
    const row = (await deps.board()).find((r) => r.id === id);
    if (!row?.managed) throw new MesaError('not_found', `no session ${id}`);
    return row;
  };
  if (isSteerCall(call))
    return answerSteer(deps.steer, call, async (id) => toPhoneRow(await managed(id)));
  const row = await managed(call.id);
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
    queued: deps.steer.queue.of(call.id),
  } satisfies CallResult<'session'>;
}
