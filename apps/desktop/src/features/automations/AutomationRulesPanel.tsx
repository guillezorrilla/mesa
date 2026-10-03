import { describeAutomation } from '@mesa/core/browser';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { AutomationRuleDialog } from './AutomationRuleDialog';
import { SchedulerAlert } from './SchedulerAlert';
import type { Automations } from './useAutomations';

/**
 * The profile's rules, or one project's when `project` is given, each as a sentence with its last
 * run, a toggle and removal; the scheduler alert shows while they cannot run.
 */
export function AutomationRulesPanel(props: { automations: Automations; project?: string }) {
  const { rules, scheduler, refresh } = props.automations;
  const run = useRun();
  const { act, acting } = useAct();
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<string>();
  const shown = rules.data?.filter((rule) => !props.project || rule.project === props.project);
  const lastRun = (name: string, project: string) =>
    scheduler.data?.runs.filter((r) => r.rule.name === name && r.rule.project === project).at(-1);
  return (
    <section aria-label="Automation rules" className="space-y-3">
      {!!shown?.length && <SchedulerAlert scheduler={scheduler.data} onChanged={refresh} />}
      <Button onClick={() => setAdding(true)}>Add automation</Button>
      {rules.error && (
        <p role="alert" className="text-destructive">
          {rules.error.message}
        </p>
      )}
      {rules.busy && !rules.data && <Muted>Loading automations...</Muted>}
      {shown?.length === 0 && <Muted>No automations defined.</Muted>}
      {shown?.map((rule) => {
        const last = lastRun(rule.name, rule.project);
        return (
          <Card key={rule.name}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {rule.name}
                  {!props.project && (
                    <span className="font-normal text-muted-foreground"> · {rule.project}</span>
                  )}
                  {!rule.enabled && (
                    <span className="font-normal text-muted-foreground"> · disabled</span>
                  )}
                </p>
                <p className="text-sm">{describeAutomation(rule)}</p>
                {last && (
                  <Muted size="xs">
                    Last run {last.status},{' '}
                    {new Date(last.endedAt ?? last.trigger.at).toLocaleString()}
                    {last.reason ? `: ${last.reason}` : ''}
                  </Muted>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting}
                  aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                  onClick={() =>
                    void act(async () => {
                      if (
                        await run(rule.enabled ? 'automations.disable' : 'automations.enable', {
                          name: rule.name,
                        })
                      )
                        refresh();
                      return undefined;
                    })
                  }
                >
                  {rule.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={acting}
                  onClick={() => setRemove(rule.name)}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {adding && (
        <AutomationRuleDialog
          project={props.project}
          onClose={() => setAdding(false)}
          onChanged={refresh}
        />
      )}
      {remove && (
        <ActionDialog
          testId="automation-remove-dialog"
          title={`Remove ${remove}?`}
          description="This rule will be removed from this profile."
          submit={{
            label: 'Remove rule',
            testId: 'automation-remove',
            disabled: acting,
            variant: 'destructive',
          }}
          onCancel={() => setRemove(undefined)}
          onSubmit={() =>
            void act(async () => {
              if (await run('automations.remove', { name: remove })) {
                setRemove(undefined);
                refresh();
              }
              return undefined;
            })
          }
        >
          <p>{remove}</p>
        </ActionDialog>
      )}
    </section>
  );
}
