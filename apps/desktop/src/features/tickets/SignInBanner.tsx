import type { FollowedView, ProviderId } from '@mesa/core';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { TRACKERS } from './trackers';

/**
 * One banner for every view a sign-in would let Mesa read: Connect when the tracker's source is
 * not connected at all, else Reconnect for a sign-in that expired or lacks a scope. It names the
 * view when only one is affected.
 */
export function SignInBanner(props: {
  tracker: ProviderId;
  views: FollowedView[];
  notConnected: boolean;
  onConnected: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const { name, source, sourceLabel } = TRACKERS[props.tracker];
  const what = props.views.length === 1 ? props.views[0]?.name : 'these views';
  const connect = () =>
    void act(async () => {
      if (await run('sources.connect', { source: props.views[0]?.connect ?? source }))
        props.onConnected();
      return undefined;
    });
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-state-waiting/15 px-3 py-2 text-sm"
    >
      <span className="flex-1">
        {props.notConnected
          ? `${name} isn't connected, so Mesa can't read ${what}.`
          : `Mesa needs a fresh sign-in to read ${what} from ${name}.`}
      </span>
      <Button variant="outline" size="sm" disabled={acting} onClick={connect}>
        {props.notConnected ? 'Connect' : 'Reconnect'} {sourceLabel}
      </Button>
    </div>
  );
}
