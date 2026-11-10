import { Network } from 'lucide-react';
import { useCommand } from '@/lib/useCommand';
import { ToggleField } from '../controls/ToggleField';
import { SettingRow } from '../SettingRow';

/** Whether child sessions' reports are typed into their parents, and how many wait. */
export function ChildReports(props: { enabled: boolean }) {
  const pending = useCommand('reports.list').data?.reports.length;
  return (
    <SettingRow
      icon={Network}
      title="Send child reports to parents"
      description="When a session started from another finishes a turn, waits on you, or ends, bring its news to the parent as the parent's turn ends, or once it is idle."
      htmlFor="sessions-child-reports"
      keywords="orchestrate worker child parent report"
      control={
        <ToggleField
          id="sessions-child-reports"
          path="sessions.childReports"
          checked={props.enabled}
        />
      }
    >
      <span
        role="status"
        className="rounded-full bg-accent px-2 py-0.5 text-muted-foreground text-xs"
      >
        {pending === undefined ? 'checking...' : `${pending} waiting`}
      </span>
    </SettingRow>
  );
}
