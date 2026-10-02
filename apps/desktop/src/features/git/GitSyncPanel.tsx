import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** Explicit, upstream-bound network actions for one selected checkout. */
export function GitSyncPanel(props: { project: string; checkout?: string; onChanged: () => void }) {
  const [pending, setPending] = useState<'push' | 'pull'>();
  const tracking = useCommand('git.tracking', { project: props.project, checkout: props.checkout });
  const run = useRun();
  const { acting, act } = useAct();
  const target = tracking.data;
  const sync = (action: 'push' | 'pull') =>
    act(async () => {
      const result = await run(action === 'push' ? 'git.push' : 'git.pull', {
        project: props.project,
        checkout: props.checkout,
      });
      if (!result) return undefined;
      setPending(undefined);
      props.onChanged();
      return said(
        `${action === 'push' ? 'Pushed' : 'Pulled'} ${result.remote}/${result.upstream}`,
        result,
      );
    });
  return (
    <section aria-label="Git sync" className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Remote</h3>
      {target ? (
        <>
          <p className="text-sm">
            <span className="font-mono">{target.branch}</span> tracks{' '}
            <span className="font-mono">
              {target.remote}/{target.upstream}
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => setPending('pull')}
            >
              Pull fast-forward
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => setPending('push')}
            >
              Push
            </Button>
          </div>
        </>
      ) : (
        <Muted>
          {tracking.busy
            ? 'Loading upstream...'
            : "Set this branch's upstream in Git to use push or pull."}
        </Muted>
      )}
      {pending && target && (
        <ActionDialog
          testId="git-sync-dialog"
          title={`${pending === 'push' ? 'Push' : 'Pull'} ${target.branch}?`}
          description={
            pending === 'push'
              ? `Push HEAD to ${target.remote}/${target.upstream} without force.`
              : `Pull ${target.remote}/${target.upstream} by fast-forward only. The checkout must be clean.`
          }
          submit={{
            label: pending === 'push' ? 'Push' : 'Pull',
            testId: 'confirm-git-sync',
            disabled: acting,
          }}
          onSubmit={() => void sync(pending)}
          onCancel={() => setPending(undefined)}
        >
          <p className="font-mono text-sm break-all">{target.checkout.path}</p>
        </ActionDialog>
      )}
    </section>
  );
}
