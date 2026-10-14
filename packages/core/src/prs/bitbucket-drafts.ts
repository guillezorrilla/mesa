import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import type { JsonRead } from '../lib/run-json.js';
import { Comment, draftOf, twg } from './bitbucket-pr.js';
import type { DraftInput, PrDraft } from './reader.js';

// Every draft Mesa leaves on Bitbucket is `--pending`: it waits in my review until I finish the
// review in Bitbucket or a post review publishes it, and nothing here approves, requests changes
// or merges (ADR-0024). Values go as `--flag=value`, so a body or path starting with `-` stays a
// value.

/**
 * Creates one comment, pending (a draft) or posted: a reply with `replyTo`, inline with `path` and
 * `line`, else the summary. Only publish posts one.
 */
export async function createComment(
  run: Runner,
  repo: string,
  number: number,
  input: DraftInput,
  pending: boolean,
): Promise<JsonRead<PrDraft>> {
  const args = [
    'bitbucket',
    'pull-requests',
    'comment',
    'create',
    `--pull-request=${number}`,
    `--repo=${repo}`,
    `--text=${input.text}`,
    ...(pending ? ['--pending'] : []),
  ];
  if (input.replyTo) args.push(`--reply-to=${input.replyTo}`);
  else if (input.path) {
    args.push(`--path=${input.path}`);
    if (input.line !== undefined) args.push(`--line=${input.line}`);
  }
  const made = await twg(run, args, Comment);
  return made.ok ? { ok: true, value: draftOf(made.value) } : made;
}

/** Leaves a pending comment: a reply with `replyTo`, inline with `path` and `line`, else the summary. */
export const draftBitbucket = (run: Runner, repo: string, number: number, input: DraftInput) =>
  createComment(run, repo, number, input, true);

// twg answers a delete with what it removed.
const Deleted = z.object({ deleted: z.literal(true) });
const Pending = z.object({ pending: z.boolean() });

/** Deletes one comment by id, unchecked: callers know it is a pending draft of mine. */
export async function deleteComment(
  run: Runner,
  repo: string,
  number: number,
  id: string,
): Promise<JsonRead<{ id: string }>> {
  const gone = await twg(
    run,
    [
      'bitbucket',
      'pull-requests',
      'comment',
      'delete',
      `--pull-request=${number}`,
      `--comment=${id}`,
      `--repo=${repo}`,
      '--yes',
    ],
    Deleted,
  );
  return gone.ok ? { ok: true, value: { id } } : gone;
}

/** Deletes one of my pending comments, after checking it is still pending: a posted one stays. */
export async function discardBitbucket(
  run: Runner,
  repo: string,
  number: number,
  id: string,
): Promise<JsonRead<{ id: string }>> {
  const found = await twg(
    run,
    [
      'bitbucket',
      'pull-requests',
      'comment',
      'get',
      String(number),
      `--comment=${id}`,
      `--repo=${repo}`,
    ],
    Pending,
  );
  if (!found.ok) return found;
  if (!found.value.pending) return { ok: false, reason: 'failed', detail: 'not a pending draft' };
  return deleteComment(run, repo, number, id);
}
