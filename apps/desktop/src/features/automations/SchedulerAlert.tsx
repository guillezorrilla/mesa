import type { AutomationStatus } from '@mesa/core';
import { CalendarClock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** While the profile's scheduler is not loaded, says its rules won't run and offers to install it. */
export function SchedulerAlert(props: { scheduler?: AutomationStatus; onChanged: () => void }) {
  const run = useRun();
  const { act, acting } = useAct();
  if (!props.scheduler || props.scheduler.loaded) return null;
  return (
    <Alert data-testid="scheduler-alert">
      <CalendarClock aria-hidden />
      <AlertTitle>
        Scheduler {props.scheduler.installed ? 'not loaded' : 'not installed'}: rules won't run
      </AlertTitle>
      <AlertDescription>
        <Button
          size="sm"
          className="mt-1"
          disabled={acting}
          onClick={() =>
            void act(async () => {
              if (await run('automations.install')) props.onChanged();
              return undefined;
            })
          }
        >
          Install scheduler
        </Button>
      </AlertDescription>
    </Alert>
  );
}
