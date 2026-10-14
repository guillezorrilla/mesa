import type { MesaContext } from '../context.js';
import { gitCommand } from '../git/command.js';
import type { CliState } from '../lib/cli-state.js';
import { mapLimit } from '../lib/map-limit.js';
import { MesaError } from '../lib/result.js';
import { listProjects } from '../projects/projects.js';
import { readBitbucket } from './bitbucket.js';
import { type Bucket, bucketOf, bucketRank, type Since } from './buckets.js';
import { readGithub } from './github.js';
import { PR_CLIS, type PrProvider, prCli, resolveRemote } from './provider.js';
import type { PrHead, PrReader } from './reader.js';

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

const READERS: Record<PrProvider, PrReader> = { github: readGithub, bitbucket: readBitbucket };

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

/** PR reviews (#785): which provider each project uses, and the PRs that need me. */
export function prsService(ctx: MesaContext) {
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

  return {
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
        const read = await READERS[p.provider](ctx.run, p.repo);
        if (!read.ok)
          return void list.problems.push({
            project: p.name,
            reason: `${PR_CLIS[p.provider].cli} ${read.reason}${read.detail ? `: ${read.detail}` : ''}`,
          });
        const before = list.prs.length;
        for (const pr of read.prs) {
          if (pr.author === read.me) continue;
          const { bucket, since } = bucketOf(pr, read.me);
          if (bucket === 'done' || (bucket === 'other' && !opts.all)) continue;
          const { number, title, url, branch, updatedAt, authorName: author } = pr;
          list.prs.push({
            ...{ project: p.name, provider: p.provider, number, title, url, branch },
            ...{ updatedAt, author, bucket, since },
          });
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
