import { useCommand } from '@/lib/useCommand';
import { GiveAccessLink } from './GiveAccessLink';

/**
 * Under the gear's tracker row for GitHub: how many repos Mesa can read, and Manage access, which
 * opens Mesa's GitHub App installation page to give it more (or fewer).
 */
export function GithubSettingsRow(props: { project: string }) {
  const repos = useCommand('tickets.repos', { project: props.project });
  const count = repos.data?.repos.length;
  return (
    <div className="-mt-2 flex items-center justify-between gap-2.5 pl-6.5 text-xs text-muted-foreground">
      <span>
        {count === undefined
          ? 'Reading repos...'
          : `Mesa can read ${count} of your repo${count === 1 ? '' : 's'}`}
      </span>
      <GiveAccessLink href={repos.data?.install} onOpen={() => {}}>
        Manage access
      </GiveAccessLink>
    </div>
  );
}
