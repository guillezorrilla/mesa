import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { AutomationRuleDialog } from './AutomationRuleDialog';

/** Optional rules in the current profile. Installation and execution are explicit later steps. */
export function AutomationsScreen() {
  const rules = useCommand('automations.list');
  const run = useRun();
  const { act, acting } = useAct();
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<string>();
  const refresh = () => void rules.refresh();
  return (
    <section data-testid="automations-screen" className="max-w-3xl space-y-4">
      <PageHeader
        title="Automations"
        description="Optional profile rules. Install the scheduler explicitly to run them."
      />
      <Button onClick={() => setAdding(true)}>Add automation</Button>
      {rules.error && (
        <p role="alert" className="text-destructive">
          {rules.error.message}
        </p>
      )}
      {rules.busy && !rules.data && <Muted>Loading automations...</Muted>}
      {rules.data?.length === 0 && <Muted>No automations defined.</Muted>}
      {rules.data?.map((rule) => (
        <Card key={rule.name}>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{rule.name}</p>
              <p className="text-sm text-muted-foreground">
                {rule.project}: {rule.when} {rule.cron ?? rule.file ?? rule.state} - {rule.run},{' '}
                {rule.guardrail}
              </p>
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
      ))}
      {adding && <AutomationRuleDialog onClose={() => setAdding(false)} onChanged={refresh} />}
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
