import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { AutomationRulesPanel } from './AutomationRulesPanel';
import { AutomationRunsPanel } from './AutomationRunsPanel';
import { useAutomations } from './useAutomations';

/** Profile rules, explicit installation, approvals and run history. */
export function AutomationsScreen() {
  const automations = useAutomations();
  const { scheduler, refresh } = automations;
  const run = useRun();
  const { act, acting } = useAct();
  return (
    <section data-testid="automations-screen" className="max-w-3xl space-y-4">
      <PageHeader
        title="Automations"
        description="Optional profile rules. They run once the scheduler is installed."
      />
      <AutomationRulesPanel automations={automations} />
      <div className="flex gap-2">
        {scheduler.data?.installed && (
          <Button
            variant="outline"
            disabled={acting}
            onClick={() =>
              void act(async () => {
                if (await run('automations.uninstall')) refresh();
                return undefined;
              })
            }
          >
            Uninstall scheduler
          </Button>
        )}
        <Button variant="ghost" onClick={refresh}>
          Refresh status
        </Button>
      </div>
      {scheduler.error && (
        <p role="alert" className="text-destructive">
          {scheduler.error.message}
        </p>
      )}
      {scheduler.data && (
        <>
          <Muted role="status">
            Scheduler {scheduler.data.loaded ? 'loaded' : 'not loaded'}
            {scheduler.data.worker ? ', running' : ''}.
          </Muted>
          <AutomationRunsPanel
            runs={scheduler.data.runs}
            acting={acting}
            onAction={(action, id) =>
              void act(async () => {
                if (
                  await run(action === 'approve' ? 'automations.approve' : 'automations.cancel', {
                    id,
                  })
                )
                  refresh();
                return undefined;
              })
            }
          />
        </>
      )}
    </section>
  );
}
