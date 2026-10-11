import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { GiveAccessLink } from './GiveAccessLink';
import { useRepoAccess } from './useRepoAccess';

/**
 * The first-run choice's GitHub row once signed in: its Use button when Mesa can read a repo,
 * else a step that sends the person to install Mesa's GitHub App on the orgs or repos they want,
 * and waits for them to come back.
 */
export function GithubRepoGate(props: { project: string; children: ReactNode }) {
  const access = useRepoAccess(props.project);
  if (!access.repos) return <Loader2 aria-label="Reading repos" className="size-4 animate-spin" />;
  if (access.repos.length) return props.children;
  const waiting = access.status.step === 'waiting';
  return (
    <div
      role="status"
      className="col-span-2 col-start-2 flex flex-wrap items-center gap-2.5 rounded-lg bg-state-waiting/15 px-2.5 py-2 text-sm"
    >
      <span className="min-w-44 flex-1">
        {waiting
          ? 'Finish on GitHub: pick the repos Mesa may read, then come back here.'
          : "Signed in. Mesa can't see any repositories yet: install it on the orgs or repos you want."}
      </span>
      <GiveAccessLink href={access.install} onOpen={access.start} button>
        {waiting ? 'Open GitHub again' : 'Install on GitHub'}
      </GiveAccessLink>
    </div>
  );
}
