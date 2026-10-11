import type { ProviderId } from '@mesa/core';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { ElsewhereLink } from './ElsewhereLink';
import { TrackerPanel } from './TrackerPanel';
import { TRACKERS } from './trackers';

/**
 * The Tickets tab of a project whose tracker is not connected (all but Jira, which keeps its
 * banner): what it follows is kept, Connect signs in, and the person can track work elsewhere.
 */
export function NotConnectedPanel(props: {
  tracker: ProviderId;
  following: number;
  onConnected: () => void;
  onElsewhere: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const { short, unit, source, sourceLabel } = TRACKERS[props.tracker];
  const n = props.following;
  const connect = () =>
    void act(async () => {
      if (await run('sources.connect', { source })) props.onConnected();
      return undefined;
    });
  return (
    <TrackerPanel
      tracker={props.tracker}
      icon={Plug}
      title={`${short} isn't connected`}
      lead={`This project tracks work in ${short}. Connect it to see your ${n} followed ${unit}${n === 1 ? '' : 's'} here; nothing was lost.`}
    >
      <Button disabled={acting} onClick={connect}>
        {acting ? 'Waiting for sign-in...' : `Connect ${sourceLabel}`}
      </Button>
      <ElsewhereLink onClick={props.onElsewhere} />
    </TrackerPanel>
  );
}
