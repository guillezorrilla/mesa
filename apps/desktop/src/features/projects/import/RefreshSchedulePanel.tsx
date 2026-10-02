import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';

/** Refresh schedules and their durable last results for this project. */
export function RefreshSchedulePanel({ project }: { project: string }) {
  const rules = useCommand('automations.list');
  const status = useCommand('automations.status');
  const schedules = rules.data?.filter((r) => r.project === project && r.run === 'refresh');
  return (
    <section aria-label="Refresh schedules" className="space-y-2">
      <p className="font-medium">Refresh schedules</p>
      {rules.error && <p role="alert">{rules.error.message}</p>}
      {status.error && <p role="alert">{status.error.message}</p>}
      {schedules?.length === 0 && <Muted>No refresh rules. Add one in Automations.</Muted>}
      {schedules?.map((rule) => {
        const last = status.data?.runs
          .filter((r) => r.rule.name === rule.name && r.rule.project === project)
          .at(-1);
        return (
          <div key={rule.name} className="text-sm">
            <p>
              {rule.name}: {rule.when} {rule.cron ?? rule.file ?? rule.state},{' '}
              {rule.enabled ? 'enabled' : 'disabled'}
              {!status.data?.loaded ? ', scheduler not loaded' : ''}
            </p>
            {last && (
              <Muted>
                Last: {last.status} at {last.endedAt ?? last.trigger.at}
                {last.result?.checked
                  ? `; checked ${(last.result.checked as string[]).length}, skipped ${(last.result.skipped as string[] | undefined)?.length ?? 0}, refreshed ${(last.result.refreshed as string[] | undefined)?.length ?? 0}`
                  : ''}
                {last.reason ? `; ${last.reason}` : ''}
              </Muted>
            )}
          </div>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void rules.refresh();
          void status.refresh();
        }}
      >
        Refresh schedule status
      </Button>
    </section>
  );
}
