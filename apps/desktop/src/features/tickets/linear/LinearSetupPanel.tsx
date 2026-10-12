import { Button } from '@/components/ui/button';
import { TrackerPanel } from '../TrackerPanel';

/** The Tickets tab of a project tracking Linear before it follows a view. */
export function LinearSetupPanel(props: { onFollow: () => void }) {
  return (
    <TrackerPanel
      tracker="linear"
      title="Pick the Linear issues to show here"
      lead="Follow a team's cycle, a project, or one of your saved views. It moves to the next cycle on its own, and any issue starts a session."
    >
      <Button onClick={props.onFollow}>Follow Linear issues</Button>
    </TrackerPanel>
  );
}
