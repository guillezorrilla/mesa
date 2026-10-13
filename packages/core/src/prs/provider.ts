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

// The host right after `https://`, `ssh://`, an optional user, or the `git@` of scp-like ssh.
const HOST = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[:/]/i;
const PROVIDERS: Record<string, PrProvider> = {
  'github.com': 'github',
  'bitbucket.org': 'bitbucket',
};

/** The provider a git remote URL is on, https or ssh; undefined for any other host. */
export function prProvider(remoteUrl: string): PrProvider | undefined {
  const host = HOST.exec(remoteUrl.trim())?.[1]?.toLowerCase();
  return host ? PROVIDERS[host] : undefined;
}

/** Whether the provider's CLI is installed and signed in. */
export const prCli = (run: Runner, provider: PrProvider): Promise<CliState> =>
  cliState(run, PR_CLIS[provider].cli, [...PR_CLIS[provider].auth]);
