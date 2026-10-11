import { Button } from '@/components/ui/button';
import { TrackerPanel } from '../TrackerPanel';

/** The Tickets tab of a project tracking GitHub before it follows a repo. */
export function GithubSetupPanel(props: { onFollow: () => void }) {
  return (
    <TrackerPanel
      tracker="github"
      title="Pick the GitHub issues to show here"
      lead="Follow this project's repo, narrowed by labels, milestone and assignee if you like. Any issue starts a session."
    >
      <Button onClick={props.onFollow}>Follow a repo</Button>
    </TrackerPanel>
  );
}
