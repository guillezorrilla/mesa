import { Button } from '@/components/ui/button';
import { TrackerPanel } from '../TrackerPanel';

/** The Tickets tab of a project tracking ClickUp before it follows a view. */
export function ClickupSetupPanel(props: { onFollow: () => void }) {
  return (
    <TrackerPanel
      tracker="clickup"
      title="Pick the ClickUp tasks to show here"
      lead="Follow a List, a whole Folder or Space, or a saved view. Subtasks come along, and any task starts a session."
    >
      <Button onClick={props.onFollow}>Follow ClickUp tasks</Button>
    </TrackerPanel>
  );
}
