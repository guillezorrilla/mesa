import type { MesaContext } from '../context.js';
import { gitCommand } from '../git/command.js';
import type { CliState } from '../lib/cli-state.js';
import { MesaError } from '../lib/result.js';
import { listProjects } from '../projects/projects.js';
import { type Bucket, bucketOf, type Since } from './buckets.js';
import { readGithub } from './github.js';
import { PR_CLIS, type PrProvider, prCli, prRemote } from './provider.js';
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
export type PrRow = PrHead & {
  project: string;
  provider: PrProvider;
  author: string;
  bucket: Exclude<Bucket, 'done'>;
  since: Since;
};

/** The list: PRs most urgent first, projects whose CLI is not ready, and repos that failed to read. */
export type PrList = {
  prs: PrRow[];
  blocked: PrSetupRow[];
  problems: { project: string; reason: string }[];
};

const nextStep = (provider: PrProvider, cli: CliState) =>
  cli.state === 'missing'
    ? PR_CLIS[provider].install
    : cli.state === 'unauthenticated'
      ? PR_CLIS[provider].signIn
      : null;

const RANK: Record<PrRow['bucket'], number> = { need: 0, updated: 1, waiting: 2, other: 3 };

/** PR reviews (#785): which provider each project uses, and the PRs that need me. */
export function prsService(ctx: MesaContext, readers: Record<PrProvider, PrReader>) {
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
    return Promise.all(
      rows
        .filter((p) => !only || p.name === only)
        .map(async ({ name, path }) => {
          const remote = await gitCommand(ctx.run, path, ['remote', 'get-url', 'origin']);
          const found = remote.ok ? prRemote(remote.stdout) : undefined;
          if (!found) return { name, setup: setupRow(name) };
          const cli = await probe(found.provider);
          return { name, ...found, cli, setup: setupRow(name, found.provider, cli) };
        }),
    );
  }

  return {
    /** Every registered project's provider, from its origin remote, and its CLI's state (mesa prs setup). */
    async setup(): Promise<PrSetupRow[]> {
      return (await projects()).map((p) => p.setup);
    },

    /**
     * The open PRs that need me across projects (mesa prs list): mine are never listed, done ones
     * drop out, and `all` keeps the ones not for me. Nothing is cached; every call reads.
     */
    async list(opts: { project?: string; all?: boolean } = {}): Promise<PrList> {
      const list: PrList = { prs: [], blocked: [], problems: [] };
      await Promise.all(
        (await projects(opts.project)).map(async (p) => {
          if (!('provider' in p) || !p.provider) return;
          if (p.cli.state !== 'ready') return void list.blocked.push(p.setup);
          const read = await readers[p.provider](ctx.run, p.repo);
          if (!read.ok)
            return void list.problems.push({
              project: p.name,
              reason: `${PR_CLIS[p.provider].cli} ${read.reason}${read.detail ? `: ${read.detail}` : ''}`,
            });
          for (const pr of read.prs) {
            if (pr.author === read.me) continue;
            const { bucket, since } = bucketOf(pr, read.me);
            if (bucket === 'done' || (bucket === 'other' && !opts.all)) continue;
            const { number, title, url, branch, updatedAt, author } = pr;
            list.prs.push({
              ...{ project: p.name, provider: p.provider, number, title, url, branch },
              ...{ updatedAt, author, bucket, since },
            });
          }
        }),
      );
      list.prs.sort(
        (a, b) => RANK[a.bucket] - RANK[b.bucket] || b.updatedAt.localeCompare(a.updatedAt),
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

/** The readers the composition root wires: one per provider. */
export const PR_READERS: Record<PrProvider, PrReader> = {
  github: readGithub,
  // Filled by the Bitbucket reader (#786); until then a Bitbucket project reports it.
  bitbucket: async () => ({ ok: false, reason: 'failed', detail: 'Bitbucket is not read yet' }),
};
