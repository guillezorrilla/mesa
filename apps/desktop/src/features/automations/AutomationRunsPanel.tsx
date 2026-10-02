import type { AutomationRun } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';

/** Waiting approvals and the latest saved results. */
export function AutomationRunsPanel({
  runs,
  acting,
  onAction,
}: {
  runs: AutomationRun[];
  acting: boolean;
  onAction: (action: 'approve' | 'cancel', id: string) => void;
}) {
  const visible = [
    ...runs.filter((r) => r.status === 'pending' || r.status === 'queued'),
    ...runs
      .filter((r) => r.status !== 'pending' && r.status !== 'queued')
      .slice(-10)
      .reverse(),
  ];
  return (
    <section className="space-y-2" aria-label="Automation runs">
      {!visible.length && <Muted>No automation runs yet.</Muted>}
      {visible.map((run) => (
        <div key={run.id} className="rounded border p-3 text-sm">
          <p className="font-medium">
            {run.rule.name}: {run.status}
          </p>
          <Muted>
            {run.trigger.kind}: {run.trigger.at}
            {run.trigger.confidence !== undefined ? `, confidence ${run.trigger.confidence}` : ''}
          </Muted>
          {run.reason && <p>{run.reason}</p>}
          {Array.isArray(run.result?.checked) && (
            <p>
              Checked {(run.result.checked as string[]).length}, skipped{' '}
              {(run.result.skipped as string[] | undefined)?.length ?? 0}, refreshed{' '}
              {(run.result.refreshed as string[] | undefined)?.length ?? 0}
            </p>
          )}
          {(run.status === 'pending' || run.status === 'queued') && (
            <div className="flex gap-2 pt-2">
              {run.status === 'pending' && (
                <Button size="sm" disabled={acting} onClick={() => onAction('approve', run.id)}>
                  Approve {run.rule.name}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => onAction('cancel', run.id)}
              >
                Cancel {run.rule.name}
              </Button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
