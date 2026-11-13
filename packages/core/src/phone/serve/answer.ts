import { MesaError } from '../../lib/result.js';
import { type AnswerChoice, isStale } from '../../sessions/answer/answer.js';
import type { PendingPrompt } from '../../sessions/answer/pending.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import type { SessionResponses } from '../../sessions/native/responses.js';
import type { UsageReport } from '../../usage/records.js';
import { isChangesCall } from '../protocol/changes.js';
import { isPrsCall } from '../protocol/prs.js';
import {
  type CallResult,
  type PhoneCall,
  type PhoneRow,
  SESSION_REPLIES,
  type WatchCall,
} from '../protocol/rpc.js';
import { isTerminalCall } from '../protocol/terminal.js';
import { answerSteer, isSteerCall, type SteerDeps } from './answer-steer.js';
import { answerChanges, type ChangesDeps } from './changes.js';
import { answerCrewCall, type CrewDeps, isCrewCall } from './crew.js';
import { answerInboxCall, type InboxDeps, isInboxCall } from './inbox.js';
import { answerPrs, type PrsDeps } from './prs.js';
import { answerPushes, type PushesDeps } from './pushes.js';
import { phoneReplies } from './replies.js';
import { managedRows, phoneRows, queuedRows, toPhoneRow } from './rows.js';
import { answerStartCall, isStartCall, type StartDeps } from './start.js';
import { phoneSteps, stepText } from './steps.js';
import { phoneUsage } from './usage.js';

/** The session functions the CLI uses, which every phone call goes through. */
export type AnswerDeps = {
  board: () => Promise<SessionRow[]>;
  responses: (id: string) => SessionResponses;
  logs: (id: string, tail: number) => { lines: string[] };
  /** A session's window sized to the phone, as its terminal draws it. */
  screen: (id: string, cols: number, rows: number) => Promise<{ text: string; at: number }>;
  /** What a session's window printed since byte `from` of its output log. */
  since: (id: string, from?: number) => { from: number; to: number; data: string };
  /** `mesa keys`: keys pressed in a plain terminal session. */
  keys: (id: string, keys: readonly string[]) => Promise<unknown>;
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
  /** Pull requests: the review queue, one PR, reviews, merging (#1064). */
  prs: Omit<PrsDeps, 'board'>;
  inbox: InboxDeps;
  /** `mesa usage`'s report. */
  usage: () => Promise<UsageReport>;
  pushes: PushesDeps;
  start: StartDeps;
};

/** The session functions as the listener answers through them, with each waiting row's ask (keptAsks). */
export type ListenerAnswers = AnswerDeps & { asked: (rows: PhoneRow[]) => Promise<PhoneRow[]> };

/** How many output lines the session screen gets. */
const TAIL = 60;
/** How many lines a terminal's live output gets: a few screens of a phone. */
const OUTPUT = 120;

/**
 * The phone's rows as the board has them now: each waiting one with its `ask`, each with how many
 * replies it has queued. The `sessions` call and the listener's watch both read them so.
 */
export const boardRows = async (deps: Pick<ListenerAnswers, 'board' | 'asked' | 'steer'>) =>
  queuedRows(await deps.asked(phoneRows(await deps.board())), deps.steer.queue.all());

/**
 * Answers one call from the phone, but a watch, which the listener keeps (sessionWatches); throws
 * a MesaError (not_found) for an unknown session.
 */
export async function answerCall(
  deps: ListenerAnswers,
  call: Exclude<PhoneCall, WatchCall>,
): Promise<unknown> {
  if (call.method === 'sessions')
    return {
      rows: await boardRows(deps),
    } satisfies CallResult<'sessions'>;
  if (isCrewCall(call)) return answerCrewCall(deps.crew, call);
  if (isChangesCall(call)) return answerChanges(deps.changes, call);
  if (isPrsCall(call)) return answerPrs({ ...deps.prs, board: deps.board }, call);
  if (isInboxCall(call)) return answerInboxCall(deps.inbox, call);
  if (call.method === 'usage')
    return phoneUsage(
      await deps.usage(),
      managedRows(await deps.board()).map(toPhoneRow),
    ) satisfies CallResult<'usage'>;
  if (call.method === 'pushes')
    return answerPushes(deps.pushes, call.set) satisfies CallResult<'pushes'>;
  if (isTerminalCall(call)) {
    if (call.method === 'output')
      return { lines: deps.logs(call.id, OUTPUT).lines } satisfies CallResult<'output'>;
    if (call.method === 'screen')
      return (await deps.screen(call.id, call.cols, call.rows)) satisfies CallResult<'screen'>;
    await deps.keys(call.id, call.keys);
    return {} satisfies CallResult<'keys'>;
  }
  if (isStartCall(call)) return answerStartCall(deps.start, call);
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
  // Newest first, as `review responses` lists them; a phone that names a count shows prompts too,
  // and a plain terminal has none.
  const read: Pick<SessionResponses, 'rows' | 'prompts' | 'steps' | 'current'> =
    row.agent === 'terminal' ? { rows: [], prompts: [], steps: [] } : deps.responses(call.id);
  if (call.method === 'step') {
    const step = read.steps.find((each) => each.id === call.step);
    if (!step) throw new MesaError('not_found', `no step ${call.step} in session ${call.id}`);
    return { text: stepText(step) } satisfies CallResult<'step'>;
  }
  const count = call.replies ?? SESSION_REPLIES.first;
  // A phone that names a count is new enough for prompts and steps.
  const newerPhone = call.replies !== undefined;
  return {
    row: toPhoneRow(row),
    goal: row.goal ?? null,
    ...phoneReplies(read, count, newerPhone),
    ...(newerPhone ? { steps: phoneSteps(read.steps, count) } : {}),
    ...(newerPhone && read.current ? { current: read.current } : {}),
    tail: deps.logs(call.id, TAIL).lines,
    queued: deps.steer.queue.of(call.id),
    archived: Boolean(row.archivedAt),
  } satisfies CallResult<'session'>;
}
