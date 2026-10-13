import { z } from 'zod';
import { HttpsUrl } from '../git/pull-requests.js';
import type { Runner } from '../lib/process.js';
import type { PrFacts } from './buckets.js';
import type { PrHead, PrReader, RepoRead } from './reader.js';

// Through twg: who I am and the repo's open PR numbers, then their details in batches of 25 (the
// most one `pull-requests get` takes), comments and commits included. `--output-summary none`
// keeps stdout pure JSON when twg runs under an agent, where it would print a YAML envelope.
// Every person is their Atlassian account id, the one `twg whoami` names me by.
// ponytail: 50 open PRs per repo and whatever comments and commits twg hydrates; page when a repo outgrows it.
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];
const BATCH = 25;

// A user without an Atlassian account (a former user) still has a uuid.
const User = z
  .object({ account_id: z.string().optional(), uuid: z.string() })
  .transform((u) => u.account_id ?? u.uuid);

const Whoami = z.object({ data: z.object({ accountId: z.string() }) });
const OpenPrs = z.array(z.object({ id: z.number().int() }));

const Pr = z.object({
  id: z.number().int(),
  title: z.string(),
  state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']),
  updated_on: z.string(),
  links: z.object({ html: z.object({ href: HttpsUrl }) }),
  source: z.object({ branch: z.object({ name: z.string() }) }),
  author: z
    .object({ account_id: z.string().optional(), uuid: z.string(), display_name: z.string() })
    .transform((u) => ({ id: u.account_id ?? u.uuid, name: u.display_name })),
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
    z.object({
      user: User,
      created_on: z.string(),
      deleted: z.boolean(),
      pending: z.boolean(),
      inline: z.object({}).optional(),
      parent: z.object({ id: z.number() }).optional(),
      // Present, even as `{}`, once the thread is resolved.
      resolution: z.object({}).nullish(),
    }),
  ),
  _commits: z.array(z.object({ date: z.string() })),
});
type Pr = z.infer<typeof Pr>;

// Several numbers come back as a batch, one number as the PR itself.
const Details = z.union([
  z
    .object({ items: z.array(z.object({ ok: z.literal(true), data: Pr })) })
    .transform((b) => b.items.map((i) => i.data)),
  Pr.transform((pr) => [pr]),
]);

const STATE = { OPEN: 'open', MERGED: 'merged', DECLINED: 'closed', SUPERSEDED: 'closed' } as const;

/** A PR as the bucket rule reads it: approvals and change requests are reviews, comments their own. */
function facts(pr: Pr, me: string): PrHead & PrFacts {
  const comments = pr._comments.filter((c) => !c.deleted && !c.pending);
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
    comments: comments.map((c) => ({ author: c.user, at: c.created_on })),
    commits: pr._commits.map((c) => c.date),
    threads: comments
      .filter((c) => c.inline && !c.parent)
      .map((c) => ({ author: c.user, resolved: c.resolution != null })),
  };
}

type Read<T> = { ok: true; value: T } | { ok: false; error: Extract<RepoRead, { ok: false }> };

async function twg<T>(run: Runner, args: string[], schema: z.ZodType<T>): Promise<Read<T>> {
  const res = await run('twg', [...args, ...JSON_OUT], 60_000);
  if (!res.ok) {
    const reason = res.reason === 'timeout' ? 'timeout' : 'failed';
    return { ok: false, error: { ok: false, reason, detail: res.detail } };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(res.stdout);
  } catch {
    return { ok: false, error: { ok: false, reason: 'invalid-data' } };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: { ok: false, reason: 'invalid-data' } };
}

/** A Bitbucket Cloud repo's open PRs through `twg`; `repo` is `workspace/repo-slug`. */
export const readBitbucket: PrReader = async (run, repo) => {
  const [who, open] = await Promise.all([
    twg(run, ['whoami'], Whoami),
    twg(
      run,
      ['bitbucket', 'pull-requests', 'query', '--repo', repo, '--state', 'OPEN', '--limit', '50'],
      OpenPrs,
    ),
  ]);
  if (!who.ok) return who.error;
  if (!open.ok) return open.error;
  const me = who.value.data.accountId;
  const ids = open.value.map((p) => String(p.id));
  const batches = Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, i) =>
    ids.slice(i * BATCH, (i + 1) * BATCH),
  );
  const details = await Promise.all(
    batches.map((batch) =>
      twg(
        run,
        ['bitbucket', 'pull-requests', 'get', ...batch, '--comments', '--repo', repo],
        Details,
      ),
    ),
  );
  const prs: (PrHead & PrFacts)[] = [];
  for (const read of details) {
    if (!read.ok) return read.error;
    prs.push(...read.value.map((pr) => facts(pr, me)));
  }
  return { ok: true, me, prs };
};
