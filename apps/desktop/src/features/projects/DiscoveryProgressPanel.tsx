import { counted } from '@mesa/core/browser';
import { Muted } from '@/components/Muted';
import { Progress } from '@/components/ui/progress';
import type { DiscoveryProgress } from './useDiscoveryAdoption';

/** Add to Mesa under way: the folder being added and a bar of folders done; then what it did. */
export function DiscoveryProgressPanel(props: { progress: DiscoveryProgress }) {
  const { total, done, current, summary } = props.progress;
  if (summary) {
    return (
      <div data-testid="discovery-summary" className="space-y-2 text-sm">
        <p>
          {counted(summary.registered, 'project')} registered, {counted(summary.adopted, 'session')}{' '}
          adopted.
        </p>
        {summary.failed.length > 0 && (
          <ul className="space-y-1">
            {summary.failed.map((f) => (
              <li key={f.label} className="text-destructive text-xs">
                <span className="font-mono">{f.label}</span>: {f.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div data-testid="discovery-progress" className="space-y-2 text-sm">
      {current && (
        <Muted>
          Adding {current.name} ({current.index} of {total})
        </Muted>
      )}
      <Progress value={total ? (done / total) * 100 : 0} aria-label="Folders added" />
    </div>
  );
}
