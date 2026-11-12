import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import type { SessionResponses } from '../../sessions/native/responses.js';
import { isChangesCall } from '../protocol/changes.js';
import type { CallResult, PhoneCall } from '../protocol/rpc.js';
import { answerChanges, type ChangesDeps } from './changes.js';
import { replySegments } from './replies.js';
import { phoneRows, toPhoneRow } from './rows.js';

/** The session functions the CLI uses, which every phone call goes through. */
export type AnswerDeps = {
  board: () => Promise<SessionRow[]>;
  responses: (id: string) => SessionResponses;
  logs: (id: string, tail: number) => { lines: string[] };
  read: (ids: readonly string[]) => unknown;
  unread: (ids: readonly string[]) => unknown;
  /** A session's changes, source control and files (#1063). */
  changes: ChangesDeps;
};

/** How many replies and output lines the session screen gets. */
const REPLIES = 5;
const TAIL = 60;

/** Answers one call from the phone; throws a MesaError (not_found) for an unknown session. */
export async function answerCall(deps: AnswerDeps, call: PhoneCall): Promise<unknown> {
  if (call.method === 'sessions')
    return { rows: phoneRows(await deps.board()) } satisfies CallResult<'sessions'>;
  if (isChangesCall(call)) return answerChanges(deps.changes, call);
  if (call.method === 'mark') {
    (call.unread ? deps.unread : deps.read)([call.id]);
    return {} satisfies CallResult<'mark'>;
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
