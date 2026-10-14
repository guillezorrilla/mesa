import { z } from 'zod';
import { diffBitbucket } from './bitbucket-diff.js';
import { discardBitbucket, draftBitbucket } from './bitbucket-drafts.js';
import { facts, Pr, twg, Whoami } from './bitbucket-pr.js';
import { publishBitbucket } from './bitbucket-publish.js';
import { showBitbucket } from './bitbucket-show.js';
import type { PrFacts } from './buckets.js';
import type { PrHead, PrProviderApi, PrReader } from './reader.js';

// Through twg: who I am and the repo's open PR numbers, then their details in batches of 25 (the
// most one `pull-requests get` takes), comments and commits included.
// ponytail: 50 open PRs per repo and whatever comments and commits twg hydrates; page when a repo outgrows it.
const BATCH = 25;

const OpenPrs = z.array(z.object({ id: z.number().int() }));

// Several numbers come back as a batch, one number as the PR itself.
const Details = z.union([
  z
    .object({ items: z.array(z.object({ ok: z.literal(true), data: Pr })) })
    .transform((b) => b.items.map((i) => i.data)),
  Pr.transform((pr) => [pr]),
]);

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
  if (!who.ok) return who;
  if (!open.ok) return open;
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
    if (!read.ok) return read;
    prs.push(...read.value.map((pr) => facts(pr, me)));
  }
  return { ok: true, me, prs };
};

/** Bitbucket Cloud through `twg`; every write is a pending comment until publish posts them (ADR-0024). */
export const bitbucketApi: PrProviderApi = {
  list: readBitbucket,
  show: showBitbucket,
  diff: diffBitbucket,
  draft: draftBitbucket,
  discard: discardBitbucket,
  publish: publishBitbucket,
};
