import { MesaError } from '../../lib/result.js';
import { type AnswerChoice, isStale } from '../../sessions/answer/answer.js';
import type { PendingPrompt } from '../../sessions/answer/pending.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import type { SessionResponses } from '../../sessions/native/responses.js';
import type { UsageReport } from '../../usage/records.js';
import { isChangesCall } from '../protocol/changes.js';
import type { CallResult, PhoneCall } from '../protocol/rpc.js';
import { answerSteer, isSteerCall, type SteerDeps } from './answer-steer.js';
import { answerChanges, type ChangesDeps } from './changes.js';
import { answerCrewCall, type CrewDeps, isCrewCall } from './crew.js';
import { answerInboxCall, type InboxDeps, isInboxCall } from './inbox.js';
import { answerPushes, type PushesDeps } from './pushes.js';
import { replySegments } from './replies.js';
import { askedRows, phoneRows, queuedRows, toPhoneRow } from './rows.js';
import { phoneUsage } from './usage.js';
import { answerVaultCall, isVaultCall, type VaultDeps } from './vault.js';

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
  /** The archived sessions, which the board leaves out. */
  archived: () => Promise<SessionRow[]>;
  steer: SteerDeps;
  /** A session's changes, source control and files (#1063). */
  changes: ChangesDeps;
  inbox: InboxDeps;
  /** `mesa usage`'s report. */
  usage: () => Promise<UsageReport>;
  pushes: PushesDeps;
  vault: VaultDeps;
};

/** How many replies and output lines the session screen gets. */
const REPLIES = 5;
const TAIL = 60;

/**
 * The phone's rows as the board has them now: each waiting one with its `ask`, each with how many
 * replies it has queued. The `sessions` call and the listener's watch both read them so.
 */
export const boardRows = async (deps: Pick<AnswerDeps, 'board' | 'prompt' | 'steer'>) =>
  queuedRows(await askedRows(phoneRows(await deps.board()), deps.prompt), deps.steer.queue.all());

/** Answers one call from the phone; throws a MesaError (not_found) for an unknown session. */
export async function answerCall(deps: AnswerDeps, call: PhoneCall): Promise<unknown> {
  if (call.method === 'sessions')
    return {
      rows: await boardRows(deps),
    } satisfies CallResult<'sessions'>;
  if (isCrewCall(call)) return answerCrewCall(deps.crew, call);
  if (isChangesCall(call)) return answerChanges(deps.changes, call);
  if (isInboxCall(call)) return answerInboxCall(deps.inbox, call);
  if (call.method === 'usage')
    return phoneUsage(
      await deps.usage(),
      phoneRows(await deps.board()),
    ) satisfies CallResult<'usage'>;
  if (call.method === 'pushes')
    return answerPushes(deps.pushes, call.set) satisfies CallResult<'pushes'>;
  if (isVaultCall(call)) return answerVaultCall(deps.vault, call);
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
