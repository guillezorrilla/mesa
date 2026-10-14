import { type CliState, cliState } from '../lib/cli-state.js';
import type { Runner } from '../lib/process.js';

/** Where a project's pull requests live, from its origin remote (CONTEXT.md, PR review). */
export type PrProvider = 'github' | 'bitbucket';

/**
 * The CLI Mesa reads and drafts through per provider: how to install it (with Homebrew, or by hand
 * without it), sign in, and, on Bitbucket, add the Bitbucket token `whoami` cannot see.
 */
export const PR_CLIS = {
  github: {
    name: 'GitHub',
    cli: 'gh',
    auth: ['auth', 'status'],
    install: 'brew install gh',
    manual: 'https://cli.github.com',
    signIn: 'gh auth login --web',
    submit: 'Submit on GitHub',
  },
  bitbucket: {
    name: 'Bitbucket',
    cli: 'twg',
    auth: ['whoami'],
    install: 'brew install atlassian/twg/twg',
    manual: 'bash <(curl -fsSL https://teamwork-graph.atlassian.com/cli/install)',
    signIn: 'twg login',
    submit: 'Finish review in Bitbucket',
    connect: 'twg setup bitbucket',
  },
} as const satisfies Record<
  PrProvider,
  {
    name: string;
    cli: string;
    auth: string[];
    install: string;
    manual: string;
    signIn: string;
    /** Where I publish my pending drafts, on the provider. */
    submit: string;
    connect?: string;
  }
>;

// The host right after `https://`, `ssh://`, an optional user, or the `git@` of scp-like ssh;
// then the repo's owner (GitHub) or workspace (Bitbucket), and its name.
const REMOTE = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
const PROVIDERS: Record<string, PrProvider> = {
  'github.com': 'github',
  'bitbucket.org': 'bitbucket',
};

type Remote = { provider: PrProvider; repo: string };

/** The provider and repo (`owner/name`) a git remote URL names, https or ssh; undefined for any other host. */
export function prRemote(remoteUrl: string, host?: string): Remote | undefined {
  const match = REMOTE.exec(remoteUrl.trim());
  const provider = PROVIDERS[(host ?? match?.[1] ?? '').toLowerCase()];
  return provider && match ? { provider, repo: `${match[2]}/${match[3]}` } : undefined;
}

/**
 * prRemote, also through an ssh host alias (`git@github.com-work:acme/web.git`, a second account's
 * `Host` in ~/.ssh/config): `ssh -G` names the host git's ssh would really reach.
 */
export async function resolveRemote(run: Runner, remoteUrl: string): Promise<Remote | undefined> {
  const direct = prRemote(remoteUrl);
  const alias = REMOTE.exec(remoteUrl.trim())?.[1];
  if (direct || !alias || /^https?:/i.test(remoteUrl.trim())) return direct;
  const config = await run('ssh', ['-G', '--', alias], 5_000);
  const host = config.ok ? /^hostname (\S+)$/m.exec(config.stdout)?.[1] : undefined;
  return host ? prRemote(remoteUrl, host) : undefined;
}

/** Whether the provider's CLI is installed and signed in. */
export const prCli = (run: Runner, provider: PrProvider): Promise<CliState> =>
  cliState(run, PR_CLIS[provider].cli, [...PR_CLIS[provider].auth]);
