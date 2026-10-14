import { z } from 'zod';
import { HttpsUrl } from '../git/pull-requests.js';
import type { Runner } from '../lib/process.js';
import { type JsonRead, runJson } from '../lib/run-json.js';
import type { PrFacts } from './buckets.js';
import type { PrDraft, PrHead } from './reader.js';

// A Bitbucket Cloud PR as `twg bitbucket pull-requests get --comments` prints it, read once for
// the list and the detail. `--output-summary none` keeps stdout pure JSON when twg runs under an
// agent, where it would print a YAML envelope. Every person is their Atlassian account id, the one
// `twg whoami` names me by.
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];

/** One twg call, its JSON answer checked against `schema`. */
export const twg = <T>(run: Runner, args: string[], schema: z.ZodType<T>) =>
  runJson(run, 'twg', [...args, ...JSON_OUT], schema, 60_000);

// A user without an Atlassian account (a former user) still has a uuid.
const User = z
  .object({ account_id: z.string().optional(), uuid: z.string() })
  .transform((u) => u.account_id ?? u.uuid);
const Person = z
  .object({ account_id: z.string().optional(), uuid: z.string(), display_name: z.string() })
  .transform((u) => ({ id: u.account_id ?? u.uuid, name: u.display_name }));

export const Whoami = z.object({ data: z.object({ accountId: z.string() }) });

/** A comment as twg prints it, alone (from `comment create`) or in a PR's `_comments`. */
export const Comment = z.object({
  id: z.number().int(),
  content: z.object({ raw: z.string() }),
  // `to` is the line on the new side; a comment on a removed line has only `from`.
  inline: z.object({ path: z.string(), to: z.number().int().nullish() }).optional(),
  parent: z.object({ id: z.number().int() }).optional(),
});
type Comment = z.infer<typeof Comment>;

export const Pr = z.object({
  id: z.number().int(),
  title: z.string(),
  state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']),
  updated_on: z.string(),
  links: z.object({ html: z.object({ href: HttpsUrl }) }),
  source: z.object({ branch: z.object({ name: z.string() }) }),
  destination: z.object({ branch: z.object({ name: z.string() }) }),
  author: Person,
  reviewers: z.array(User),
  participants: z.array(
    z.object({
      user: User,
      approved: z.boolean(),
      state: z.string().nullable(),
      participated_on: z.string().nullable(),
    }),
  ),
  _comments: z.array(
    Comment.extend({
      user: Person,
      created_on: z.string(),
      deleted: z.boolean(),
      pending: z.boolean(),
      // Present, even as `{}`, once the thread is resolved.
      resolution: z.object({}).nullish(),
    }),
  ),
  _commits: z.array(z.object({ date: z.string() })),
  // The head commit's build statuses: SUCCESSFUL, FAILED, INPROGRESS or STOPPED.
  _statuses: z.array(z.object({ state: z.string() })).default([]),
});
export type Pr = z.infer<typeof Pr>;

const STATE = { OPEN: 'open', MERGED: 'merged', DECLINED: 'closed', SUPERSEDED: 'closed' } as const;

/** Comments everyone sees: not deleted and not someone's pending draft. */
export const posted = (pr: Pr) => pr._comments.filter((c) => !c.deleted && !c.pending);

/** A PR as the bucket rule reads it: approvals and change requests are reviews, comments their own. */
export function facts(pr: Pr, me: string): PrHead & PrFacts {
  const comments = posted(pr);
  return {
    number: pr.id,
    title: pr.title,
    url: pr.links.html.href,
    branch: pr.source.branch.name,
    updatedAt: pr.updated_on,
    author: pr.author.id,
    authorName: pr.author.name,
    state: STATE[pr.state],
    requested: pr.reviewers.includes(me),
    // ponytail: Bitbucket keeps one state per participant, dated by their last participation.
    reviews: pr.participants.flatMap((p) => {
      const state = p.approved ? 'approved' : p.state === 'changes_requested' ? 'changes' : null;
      return state ? [{ author: p.user, state, at: p.participated_on ?? pr.updated_on }] : [];
    }),
    comments: comments.map((c) => ({ author: c.user.id, at: c.created_on })),
    commits: pr._commits.map((c) => c.date),
    threads: comments
      .filter((c) => c.inline && !c.parent)
      .map((c) => ({ author: c.user.id, resolved: c.resolution != null })),
  };
}

/** A pending comment as a draft: no inline anchor is the summary, a parent makes it a reply. */
export const draftOf = (c: Comment): PrDraft => ({
  id: String(c.id),
  path: c.inline?.path ?? null,
  line: c.inline?.to ?? null,
  body: c.content.raw,
  ...(c.parent ? { replyTo: String(c.parent.id) } : {}),
});

/** My pending comments on the PR, as drafts: what only I see until they are posted. */
export const myDrafts = (pr: Pr, me: string): PrDraft[] =>
  pr._comments.filter((c) => c.pending && !c.deleted && c.user.id === me).map(draftOf);

/** Who I am and one PR with its comments, read together through `twg`. */
export async function readPr(
  run: Runner,
  repo: string,
  number: number,
): Promise<JsonRead<{ me: string; pr: Pr }>> {
  const [who, got] = await Promise.all([
    twg(run, ['whoami'], Whoami),
    twg(
      run,
      ['bitbucket', 'pull-requests', 'get', String(number), '--comments', '--repo', repo],
      Pr,
    ),
  ]);
  if (!who.ok) return who;
  if (!got.ok) return got;
  return { ok: true, value: { me: who.value.data.accountId, pr: got.value } };
}
