import type { MesaContext } from '../context.js';
import { gitCommand } from '../git/command.js';
import type { CliState } from '../lib/cli-state.js';
import { mapLimit } from '../lib/map-limit.js';
import { MesaError } from '../lib/result.js';
import type { JsonRead } from '../lib/run-json.js';
import { listProjects } from '../projects/projects.js';
import { callerOf } from '../sessions/window/caller.js';
import { bitbucketApi } from './bitbucket.js';
import {
  type Bucket,
  bucketOf,
  bucketRank,
  commentPlace,
  type PrFacts,
  type Since,
} from './buckets.js';
import { githubApi } from './github.js';
import { PR_CLIS, type PrProvider, prCli, resolveRemote } from './provider.js';
import type { DraftInput, PrDraft, PrHead, PrProviderApi, PrRead } from './reader.js';
import { reviewPrompt } from './review-prompt.js';
import { type ReviewStartDeps, startReview } from './review-start.js';

/** A project's PR provider and its CLI's state; `next` is the command that unblocks it, if any. */
export type PrSetupRow = {
  project: string;
  provider: PrProvider | null;
  cli: string | null;
  state: CliState['state'] | null;
  version?: string;
  next: string | null;
};

/** One PR in the Reviews list (CONTEXT.md, Review bucket). */
export type PrRow = Omit<PrHead, 'authorName'> & {
  project: string;
  provider: PrProvider;
  author: string;
  bucket: Exclude<Bucket, 'done'>;
  since: Since;
};

/**
 * The list: PRs most urgent first, projects whose CLI is not ready, repos that failed to read,
 * and the projects read with nothing listed.
 */
export type PrList = {
  prs: PrRow[];
  blocked: PrSetupRow[];
  problems: { project: string; reason: string }[];
  quiet: string[];
};

/** One PR in full (mesa prs show): its row, the detail, my threads, my Pending drafts, its files. */
export type PrDetail = Omit<PrRow, 'bucket'> & Omit<PrRead, 'me' | 'pr'> & { bucket: Bucket };

const APIS: Record<PrProvider, PrProviderApi> = { github: githubApi, bitbucket: bitbucketApi };

/** Why a CLI read failed, naming the CLI. */
const failure = (cli: string, read: { reason: string; detail?: string }) =>
  `${cli} ${read.reason}${read.detail ? `: ${read.detail}` : ''}`;

/** A CLI read's value, or its failure as an error naming the CLI and where to fix it. */
function unwrap<T>(cli: string, read: JsonRead<T>): T {
  if (read.ok) return read.value;
  throw new MesaError('internal', `${failure(cli, read)}; see mesa prs setup`);
}

/** A provider's PR as the list and the detail both name it, in my bucket. */
function rowOf(
  project: string,
  provider: PrProvider,
  pr: PrHead & PrFacts,
  me: string,
): Omit<PrRow, 'bucket'> & { bucket: Bucket } {
  const { bucket, since } = bucketOf(pr, me);
  const { number, title, url, branch, updatedAt, authorName: author } = pr;
  return { project, provider, number, title, url, branch, updatedAt, author, bucket, since };
}

// What unblocks a CLI: install it, sign in, or (not answering) ask it its version by hand.
const nextStep = (provider: PrProvider, cli: CliState) =>
  ({
    ready: null,
    missing: PR_CLIS[provider].install,
    unauthenticated: PR_CLIS[provider].signIn,
    unavailable: `${PR_CLIS[provider].cli} --version`,
  })[cli.state];

// ponytail: 4 projects read at once keeps gh and twg inside their rate limits; raise it if lists drag.
const AT_ONCE = 4;

/** PR reviews (#785): which provider each project uses, the PRs that need me, and review sessions. */
export function prsService(ctx: MesaContext, deps: Pick<ReviewStartDeps, 'open'>) {
  /** Registered projects (or the one asked for) with their provider and repo from origin, and a CLI probe each provider shares. */
  async function projects(only?: string) {
    const rows = listProjects(ctx.open());
    if (only && !rows.some((p) => p.name === only))
      throw new MesaError('not_found', `no project named ${only}`);
    const probes = new Map<PrProvider, Promise<CliState>>();
    const probe = (provider: PrProvider) => {
      const started = probes.get(provider) ?? prCli(ctx.run, provider);
      probes.set(provider, started);
      return started;
    };
    return mapLimit(
      rows.filter((p) => !only || p.name === only),
      AT_ONCE,
      async ({ name, path }) => {
        const remote = await gitCommand(ctx.run, path, ['remote', 'get-url', 'origin']);
        const found = remote.ok ? await resolveRemote(ctx.run, remote.stdout) : undefined;
        if (!found) return { name, setup: setupRow(name) };
        const cli = await probe(found.provider);
        return { name, ...found, cli, setup: setupRow(name, found.provider, cli) };
      },
    );
  }

  /**
   * The project's provider and repo from its origin remote; refused when it has none. The CLI is
   * not probed here: a missing or signed-out one fails the provider call itself (unwrap).
   */
  async function reach(project: string) {
    const entry = listProjects(ctx.open()).find((p) => p.name === project);
    if (!entry) throw new MesaError('not_found', `no project named ${project}`);
    const remote = await gitCommand(ctx.run, entry.path, ['remote', 'get-url', 'origin']);
    const found = remote.ok ? await resolveRemote(ctx.run, remote.stdout) : undefined;
    if (!found)
      throw new MesaError('usage', `${project}'s origin remote is not on GitHub or Bitbucket`);
    return { ...found, api: APIS[found.provider], cli: PR_CLIS[found.provider].cli };
  }

  async function show(project: string, number: number): Promise<PrDetail> {
    const { provider, repo, api, cli } = await reach(project);
    const { me, pr, threads, ...detail } = unwrap(cli, await api.show(ctx.run, repo, number));
    return {
      ...rowOf(project, provider, pr, me),
      ...detail,
      threads: threads.filter((t) => t.author === me),
    };
  }

  return {
    show,

    /**
     * Starts a review session on the PR (mesa prs start), in a worktree at its head; or names the
     * one already running. `post` is the person's yes to publish this review when it is written.
     */
    start: async (project: string, number: number, opts: { post?: boolean } = {}) => {
      const pr = await show(project, number);
      const entry = listProjects(ctx.open()).find((p) => p.name === project);
      if (!entry?.agent) throw new MesaError('usage', `${project} has no agent to review with`);
      const mode = opts.post ? 'post' : 'drafts';
      return startReview(
        { run: ctx.run, projectPath: entry.path, sessions: () => ctx.store.list(), ...deps },
        {
          project,
          number,
          provider: pr.provider,
          sourceBranch: pr.branch,
          post: mode === 'post',
          agent: entry.agent,
          goal: (round, head) =>
            reviewPrompt({
              ...{ project, number, title: pr.title, author: pr.author, url: pr.url },
              ...{ provider: pr.provider, round, mode, head },
              ...(round > 1 ? { earlier: pr.threads } : {}),
            }),
        },
      );
    },

    /**
     * Publishes my Pending drafts on the PR (mesa prs publish): only from a review session of this
     * PR started with Post now, never as an approval or a change request (ADR-0024).
     */
    publish: async (project: string, number: number) => {
      const { review } =
        callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session ?? {};
      if (review?.pr !== number || review.mode !== 'post')
        throw new MesaError(
          'usage',
          `publishing #${number} needs a review session of it started with Post now; submit drafts on the provider instead`,
        );
      const { provider, repo, api, cli } = await reach(project);
      return ctx.record(
        {
          kind: 'connection',
          summary: (r: { published: number }) =>
            `Published ${r.published} review comments on ${project} #${number}`,
          failure: `Could not publish the review of ${project} #${number}`,
          inputs: { project, number, round: review.round },
          outputs: (r) => ({ provider, published: r.published }),
          project: () => project,
        },
        async () => unwrap(cli, await api.publish(ctx.run, repo, number)),
      );
    },

    /** My Pending drafts on the PR (mesa prs drafts). */
    drafts: async (project: string, number: number) => (await show(project, number)).drafts,

    /**
     * Leaves one Pending draft on the PR (mesa prs draft): inline, a reply, or the summary. No one
     * sees it until I submit the review on the provider; Mesa never submits.
     */
    draft: async (project: string, number: number, input: DraftInput) => {
      if (!input.text.trim()) throw new MesaError('usage', 'a draft needs --text');
      if (input.replyTo !== undefined && (input.path !== undefined || input.line !== undefined))
        throw new MesaError(
          'usage',
          'a reply sits in its thread: pass --reply-to or --path and --line',
        );
      if ((input.path === undefined) !== (input.line === undefined))
        throw new MesaError('usage', 'an inline draft needs both --path and --line');
      if (input.line !== undefined && (!Number.isInteger(input.line) || input.line < 1))
        throw new MesaError('usage', '--line must be a positive whole number');
      const { provider, repo, api, cli } = await reach(project);
      return ctx.record(
        {
          kind: 'connection',
          summary: (d: PrDraft) =>
            `Drafted a pending comment on ${project} #${number} (${commentPlace(d)})`,
          failure: `Could not draft a comment on ${project} #${number}`,
          inputs: {
            project,
            number,
            ...(input.path ? { path: input.path, line: input.line } : {}),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
          },
          outputs: (d) => ({ provider, id: d.id, pending: true }),
          project: () => project,
        },
        async () => unwrap(cli, await api.draft(ctx.run, repo, number, input)),
      );
    },

    /** Deletes one of my Pending drafts (mesa prs discard). */
    discard: async (project: string, number: number, id: string) => {
      const { provider, repo, api, cli } = await reach(project);
      return ctx.record(
        {
          kind: 'connection',
          summary: () => `Discarded a pending comment on ${project} #${number}`,
          failure: `Could not discard a pending comment on ${project} #${number}`,
          inputs: { project, number, id },
          outputs: () => ({ provider, id }),
          project: () => project,
        },
        async () => unwrap(cli, await api.discard(ctx.run, repo, number, id)),
      );
    },

    /** Each registered project's (or the one asked for) provider, from its origin remote, and its CLI's state (mesa prs setup). */
    async setup(project?: string): Promise<PrSetupRow[]> {
      return (await projects(project)).map((p) => p.setup);
    },

    /**
     * The open PRs that need me across projects (mesa prs): mine are never listed, done ones
     * drop out, and `all` keeps the ones not for me. Nothing is cached; every call reads.
     */
    async list(opts: { project?: string; all?: boolean } = {}): Promise<PrList> {
      const list: PrList = { prs: [], blocked: [], problems: [], quiet: [] };
      await mapLimit(await projects(opts.project), AT_ONCE, async (p) => {
        if (!('provider' in p) || !p.provider) return;
        if (p.cli.state !== 'ready') return void list.blocked.push(p.setup);
        const read = await APIS[p.provider].list(ctx.run, p.repo);
        if (!read.ok)
          return void list.problems.push({
            project: p.name,
            reason: failure(PR_CLIS[p.provider].cli, read),
          });
        const before = list.prs.length;
        for (const pr of read.prs) {
          if (pr.author === read.me) continue;
          const row = rowOf(p.name, p.provider, pr, read.me);
          if (row.bucket === 'done' || (row.bucket === 'other' && !opts.all)) continue;
          list.prs.push({ ...row, bucket: row.bucket });
        }
        if (list.prs.length === before) list.quiet.push(p.name);
      });
      list.quiet.sort();
      list.prs.sort(
        (a, b) =>
          bucketRank(a.bucket) - bucketRank(b.bucket) || b.updatedAt.localeCompare(a.updatedAt),
      );
      return list;
    },
  };
}

function setupRow(project: string, provider?: PrProvider, cli?: CliState): PrSetupRow {
  if (!provider || !cli) return { project, provider: null, cli: null, state: null, next: null };
  return {
    project,
    provider,
    cli: PR_CLIS[provider].cli,
    state: cli.state,
    ...('version' in cli ? { version: cli.version } : {}),
    next: nextStep(provider, cli),
  };
}
