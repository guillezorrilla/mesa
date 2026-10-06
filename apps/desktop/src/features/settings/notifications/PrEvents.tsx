import type { GhState } from '@mesa/core';
import { GitPullRequest } from 'lucide-react';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { ToggleField } from '../controls/ToggleField';
import { SettingRow } from '../SettingRow';

/** What gh's state means for PR events, in a few words. */
const GH_STATES: Record<GhState['state'], string> = {
  ready: 'gh: ready',
  unauthenticated: 'gh: not logged in, run gh auth login',
  missing: 'gh: not installed',
  unavailable: 'gh: not responding',
};

/** Whether PR events go into their sessions, and whether gh can read them. */
export function PrEvents(props: { enabled: boolean }) {
  const events = useCommand('prEvents.list');
  const gh = events.data?.gh;
  return (
    <SettingRow
      icon={GitPullRequest}
      title="Send PR events to sessions"
      description="Forward new CI failures, reviews, and comments on a session's pull request into it once it is idle."
      htmlFor="sessions-pr-events"
      keywords="github pull request checks reviews comments gh"
      control={
        <ToggleField id="sessions-pr-events" path="sessions.prEvents" checked={props.enabled} />
      }
    >
      <span
        role="status"
        className={cn(
          'rounded-full px-2 py-0.5 text-xs',
          gh?.state === 'ready'
            ? 'bg-state-idle/15 text-state-idle'
            : 'bg-accent text-muted-foreground',
        )}
      >
        {gh ? GH_STATES[gh.state] : 'gh: checking...'}
      </span>
    </SettingRow>
  );
}
