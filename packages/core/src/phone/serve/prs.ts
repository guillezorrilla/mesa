import { MesaError } from '../../lib/result.js';
import type { PrEventsDelivered } from '../../pr-events/pr-event-delivery.js';
import type { MergeMethod } from '../../prs/github-merge.js';
import type { MergeCaller, PrTarget } from '../../prs/merge.js';
import type { DraftInput } from '../../prs/reader.js';
import { reviewing } from '../../prs/review-sessions.js';
import type { PrDetail, PrList } from '../../prs/service.js';
import type { ManagedRow, SessionRow } from '../../sessions/board/rows.js';
import { heldWorktrees } from '../../sessions/record/holders.js';
import { sendable } from '../../sessions/record/lifecycle.js';
import type { PhonePr, PrsCall } from '../protocol/prs.js';
import type { CallResult } from '../protocol/rpc.js';
import { patchFiles, patchPage } from './patch-files.js';

/** The PR functions the CLI uses (`mesa prs`, `prs show/diff/start/discard/draft/resolve/merge`, `pr-events --deliver`). */
export type PrsDeps = {
  list: () => Promise<PrList>;
  show: (project: string, number: number) => Promise<PrDetail>;
  /** The PR's patch; `reuse` takes a read kept from just before, as a session's diff does. */
  diff: (project: string, number: number, reuse?: boolean) => Promise<{ patch: string }>;
  start: (
    project: string,
    number: number,
    opts: { post?: boolean },
  ) => Promise<{ session: string; existing: boolean; mode: string }>;
  discard: (project: string, number: number, id: string) => Promise<unknown>;
  /** Leaves a Pending draft; a ranked finding under the bar is dropped (never from the phone). */
  draft: (
    project: string,
    number: number,
    input: DraftInput,
  ) => Promise<{ result: { id: string } } | { drafted: false }>;
  resolve: (
    project: string,
    number: number,
    thread: string,
    resolved: boolean,
  ) => Promise<{ result: { resolved: boolean } }>;
  merge: (
    pr: PrTarget,
    opts: { method: MergeMethod; confirm: boolean; caller: MergeCaller },
  ) => Promise<{ result: { method: string; head: string } }>;
  deliver: () => Promise<PrEventsDelivered>;
  board: () => Promise<SessionRow[]>;
};

const row = (pr: Omit<PhonePr, 'bucket'> & { bucket: string }): PhonePr => ({
  project: pr.project,
  number: pr.number,
  title: pr.title,
  author: pr.author,
  branch: pr.branch,
  bucket: pr.bucket,
  updatedAt: pr.updatedAt,
  url: pr.url,
});

/** The live session working on `branch` of `project`: a failed check on it is that session's. */
const ownerOf = (rows: readonly SessionRow[], project: string, branch: string) =>
  rows.find(
    (r) =>
      sendable(r) &&
      !r.review &&
      heldWorktrees(r).some((held) => held.project === project && held.worktree.branch === branch),
  )?.id ?? null;

/** The PR's live review session, the newest. */
const reviewOf = (rows: readonly SessionRow[], project: string, number: number) => {
  const live = rows.filter(
    (r): r is ManagedRow =>
      r.managed && r.alive && r.project === project && r.review?.pr === number,
  );
  const last = live.at(-1);
  return last?.review
    ? { session: last.id, mode: last.review.mode, working: reviewing(last) }
    : null;
};

/** Answers one PR call (#1064) through the same core functions as `mesa prs` and `pr-events`. */
export async function answerPrs(deps: PrsDeps, call: PrsCall): Promise<unknown> {
  if (call.method === 'prs') {
    const { prs, blocked, problems } = await deps.list();
    return {
      prs: prs.map(row),
      problems: [
        ...blocked.map(
          (b) => `${b.project}: ${b.cli ?? 'its PR CLI'} is not ready (${b.next ?? b.state})`,
        ),
        ...problems.map((p) => `${p.project}: ${p.reason}`),
      ],
    } satisfies CallResult<'prs'>;
  }
  const { project, number } = call;
  switch (call.method) {
    case 'pr': {
      const [pr, rows] = await Promise.all([deps.show(project, number), deps.board()]);
      return {
        ...row(pr),
        provider: pr.provider,
        state: pr.state,
        body: pr.body,
        base: pr.base,
        additions: pr.additions,
        deletions: pr.deletions,
        checks: pr.checks,
        checkList: pr.checkList,
        threads: pr.threads.map(({ author: _, verdict, ...thread }) => ({
          ...thread,
          ...(verdict ? { verdict: verdict.state } : {}),
        })),
        drafts: pr.drafts.map(({ id, path, line, body }) => ({ id, path, line, body })),
        owner: ownerOf(rows, project, pr.branch),
        review: reviewOf(rows, project, number),
      } satisfies CallResult<'pr'>;
    }
    case 'prChanges': {
      const [pr, { patch }] = await Promise.all([
        deps.show(project, number),
        deps.diff(project, number),
      ]);
      const files = patchFiles(patch).map(({ lines: _, ...file }) => file);
      return {
        base: pr.base,
        branch: pr.branch,
        files,
        omitted: 0,
      } satisfies CallResult<'prChanges'>;
    }
    case 'prDiff': {
      const { patch } = await deps.diff(project, number, true);
      const file = patchFiles(patch).find((f) => f.path === call.path);
      if (!file || file.rev !== call.rev)
        throw new MesaError('not_found', `${call.path} changed since it was opened; open it again`);
      return patchPage(file.lines, call.from) satisfies CallResult<'prDiff'>;
    }
    case 'prStart': {
      const { session, existing, mode } = await deps.start(project, number, { post: call.post });
      return { session, existing, mode } satisfies CallResult<'prStart'>;
    }
    case 'prDiscard':
      await deps.discard(project, number, call.draft);
      return {} satisfies CallResult<'prDiscard'>;
    case 'prReply': {
      const left = await deps.draft(project, number, { text: call.text, replyTo: call.thread });
      if (!('result' in left)) throw new MesaError('internal', 'the reply was not drafted');
      return { id: left.result.id } satisfies CallResult<'prReply'>;
    }
    case 'prResolve': {
      const { result } = await deps.resolve(project, number, call.thread, call.resolved);
      return { resolved: result.resolved } satisfies CallResult<'prResolve'>;
    }
    case 'prMerge': {
      const { result } = await deps.merge(
        { project, number },
        { method: call.how, confirm: call.confirm, caller: 'phone' },
      );
      return { how: result.method, head: result.head } satisfies CallResult<'prMerge'>;
    }
    case 'prSend': {
      const [pr, delivered] = [await deps.show(project, number), await deps.deliver()];
      const owner = ownerOf(await deps.board(), project, pr.branch);
      const mine = delivered.deliveries.find((d) => d.session === owner);
      if (!owner || !mine)
        return {
          status: 'nothing',
          reason: owner
            ? 'nothing new on this PR waits for its session'
            : 'no live session works on this branch',
        } satisfies CallResult<'prSend'>;
      return {
        status: mine.status,
        session: mine.session,
        ...(mine.reason ? { reason: mine.reason } : {}),
      } satisfies CallResult<'prSend'>;
    }
  }
}
