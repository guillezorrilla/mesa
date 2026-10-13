import type { MesaContext } from '../context.js';
import { gitCommand } from '../git/command.js';
import type { CliState } from '../lib/cli-state.js';
import { listProjects } from '../projects/projects.js';
import { PR_CLIS, type PrProvider, prCli, prProvider } from './provider.js';

/** A project's PR provider and its CLI's state; `next` is the command that unblocks it, if any. */
export type PrSetupRow = {
  project: string;
  provider: PrProvider | null;
  cli: string | null;
  state: CliState['state'] | null;
  version?: string;
  next: string | null;
};

const nextStep = (provider: PrProvider, cli: CliState) =>
  cli.state === 'missing'
    ? PR_CLIS[provider].install
    : cli.state === 'unauthenticated'
      ? PR_CLIS[provider].signIn
      : null;

/** PR reviews (#785): which provider each project uses and whether Mesa can reach it. */
export function prsService(ctx: MesaContext) {
  return {
    /** Every registered project's provider, from its origin remote, and its CLI's state (mesa prs setup). */
    async setup(): Promise<PrSetupRow[]> {
      // One probe per CLI, however many projects share it.
      const probes = new Map<PrProvider, Promise<CliState>>();
      const probe = (provider: PrProvider) => {
        const known = probes.get(provider);
        if (known) return known;
        const started = prCli(ctx.run, provider);
        probes.set(provider, started);
        return started;
      };
      return Promise.all(
        listProjects(ctx.open()).map(async ({ name, path }): Promise<PrSetupRow> => {
          const remote = await gitCommand(ctx.run, path, ['remote', 'get-url', 'origin']);
          const provider = remote.ok ? prProvider(remote.stdout) : undefined;
          if (!provider)
            return { project: name, provider: null, cli: null, state: null, next: null };
          const cli = await probe(provider);
          return {
            project: name,
            provider,
            cli: PR_CLIS[provider].cli,
            state: cli.state,
            ...('version' in cli ? { version: cli.version } : {}),
            next: nextStep(provider, cli),
          };
        }),
      );
    },
  };
}
