import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import type { JsonRead } from '../lib/run-json.js';
import { draftOf, facts, Pr, posted, twg, Whoami } from './bitbucket-pr.js';
import type { PrRead, PrThread } from './reader.js';

// An added file has no `old`, a deleted one no `new`.
// ponytail: twg's default of 100 files; page when a PR outgrows it.
const Diffstat = z.array(
  z
    .object({
      lines_added: z.number().int(),
      lines_removed: z.number().int(),
      old: z.object({ path: z.string() }).nullish(),
      new: z.object({ path: z.string() }).nullish(),
    })
    .transform((f) => ({
      path: f.new?.path ?? f.old?.path ?? '',
      additions: f.lines_added,
      deletions: f.lines_removed,
    })),
);

/** The head commit's statuses rolled up: one failure fails it, one still running keeps it pending. */
function checksOf(pr: Pr): PrRead['checks'] {
  const states = pr._statuses.map((s) => s.state);
  if (states.length === 0) return null;
  if (states.some((s) => s === 'FAILED' || s === 'STOPPED')) return 'failing';
  if (states.some((s) => s === 'INPROGRESS')) return 'pending';
  return 'passing';
}

/** Inline threads, each with its newest posted reply; a reply may answer another reply. */
function threadsOf(pr: Pr): PrThread[] {
  const comments = posted(pr);
  const parentOf = new Map(pr._comments.map((c) => [c.id, c.parent?.id]));
  const rootOf = (id: number) => {
    let at = id;
    for (let hops = 0, up = parentOf.get(at); up !== undefined && hops < 100; hops++) {
      at = up;
      up = parentOf.get(at);
    }
    return at;
  };
  const last = new Map<number, (typeof comments)[number]>();
  for (const c of comments) {
    if (!c.parent) continue;
    const root = rootOf(c.id);
    const seen = last.get(root);
    if (!seen || Date.parse(c.created_on) > Date.parse(seen.created_on)) last.set(root, c);
  }
  return comments.flatMap((c) => {
    if (!c.inline || c.parent) return [];
    const reply = last.get(c.id);
    return [
      {
        id: String(c.id),
        author: c.user.id,
        path: c.inline.path,
        line: c.inline.to ?? null,
        body: c.content.raw,
        resolved: c.resolution != null,
        ...(reply ? { lastReply: { author: reply.user.name, body: reply.content.raw } } : {}),
      },
    ];
  });
}

/** One Bitbucket PR in full through `twg`: its facts, threads, my pending drafts, files and checks. */
export async function showBitbucket(
  run: Runner,
  repo: string,
  number: number,
): Promise<JsonRead<PrRead>> {
  const id = String(number);
  const [who, got, stat] = await Promise.all([
    twg(run, ['whoami'], Whoami),
    twg(run, ['bitbucket', 'pull-requests', 'get', id, '--comments', '--repo', repo], Pr),
    twg(run, ['bitbucket', 'pull-requests', 'diffstat', id, '--repo', repo], Diffstat),
  ]);
  if (!who.ok) return who;
  if (!got.ok) return got;
  if (!stat.ok) return stat;
  const me = who.value.data.accountId;
  const pr = got.value;
  const files = stat.value;
  return {
    ok: true,
    value: {
      me,
      pr: facts(pr, me),
      base: pr.destination.branch.name,
      additions: files.reduce((n, f) => n + f.additions, 0),
      deletions: files.reduce((n, f) => n + f.deletions, 0),
      checks: checksOf(pr),
      threads: threadsOf(pr),
      drafts: pr._comments.filter((c) => c.pending && !c.deleted && c.user.id === me).map(draftOf),
      files,
    },
  };
}
