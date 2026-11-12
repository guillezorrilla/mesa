import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import type { SessionResponses } from '../../sessions/native/responses.js';
import type { CallResult, PhoneCall } from '../protocol/rpc.js';
import { answerSteer, isSteerCall, type SteerDeps } from './answer-steer.js';
import { answerCrewCall, type CrewDeps, isCrewCall } from './crew.js';
import { replySegments } from './replies.js';
import { phoneRows, toPhoneRow } from './rows.js';

/** The session functions the CLI uses, which every phone call goes through. */
export type AnswerDeps = {
  board: () => Promise<SessionRow[]>;
  responses: (id: string) => SessionResponses;
  logs: (id: string, tail: number) => { lines: string[] };
  read: (ids: readonly string[]) => unknown;
  unread: (ids: readonly string[]) => unknown;
  crew: CrewDeps;
  /** The archived sessions, which the board leaves out. */
  archived: () => Promise<SessionRow[]>;
  steer: SteerDeps;
};

/** How many replies and output lines the session screen gets. */
const REPLIES = 5;
const TAIL = 60;

/** Answers one call from the phone; throws a MesaError (not_found) for an unknown session. */
export async function answerCall(deps: AnswerDeps, call: PhoneCall): Promise<unknown> {
  if (call.method === 'sessions')
    return { rows: phoneRows(await deps.board()) } satisfies CallResult<'sessions'>;
  if (isCrewCall(call)) return answerCrewCall(deps.crew, call);
  if (call.method === 'mark') {
    (call.unread ? deps.unread : deps.read)([call.id]);
    return {} satisfies CallResult<'mark'>;
  }
  /** The session the call names, as the board has it now, or archived. */
  const managed = async (id: string) => {
    const find = (rows: SessionRow[]) => rows.find((r) => r.id === id);
    const row = find(await deps.board()) ?? find(await deps.archived());
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
    archived: Boolean(row.archivedAt),
  } satisfies CallResult<'session'>;
}
