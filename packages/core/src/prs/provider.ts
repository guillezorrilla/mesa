import { type CliState, cliState } from '../lib/cli-state.js';
import type { Runner } from '../lib/process.js';

/** Where a project's pull requests live, from its origin remote (CONTEXT.md, PR review). */
export type PrProvider = 'github' | 'bitbucket';

/** The CLI Mesa reads and drafts through per provider, how to install it, and how to sign in. */
export const PR_CLIS = {
  github: {
    cli: 'gh',
    auth: ['auth', 'status'],
    install: 'brew install gh',
    signIn: 'gh auth login --web',
  },
  bitbucket: {
    cli: 'twg',
    auth: ['whoami'],
    install: 'brew install atlassian/twg/twg',
    signIn: 'twg login',
  },
} as const satisfies Record<
  PrProvider,
  { cli: string; auth: string[]; install: string; signIn: string }
>;

// The host right after `https://`, `ssh://`, an optional user, or the `git@` of scp-like ssh;
// then the repo's owner (GitHub) or workspace (Bitbucket), and its name.
const REMOTE = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;
const PROVIDERS: Record<string, PrProvider> = {
  'github.com': 'github',
  'bitbucket.org': 'bitbucket',
};

/** The provider and repo (`owner/name`) a git remote URL names, https or ssh; undefined for any other host. */
export function prRemote(remoteUrl: string): { provider: PrProvider; repo: string } | undefined {
  const match = REMOTE.exec(remoteUrl.trim());
  const provider = match?.[1] ? PROVIDERS[match[1].toLowerCase()] : undefined;
  return provider && match ? { provider, repo: `${match[2]}/${match[3]}` } : undefined;
}

/** The provider a git remote URL is on; undefined for any other host. */
export const prProvider = (remoteUrl: string) => prRemote(remoteUrl)?.provider;

/** Whether the provider's CLI is installed and signed in. */
export const prCli = (run: Runner, provider: PrProvider): Promise<CliState> =>
  cliState(run, PR_CLIS[provider].cli, [...PR_CLIS[provider].auth]);
