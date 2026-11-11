import type { TreeRow } from '@mesa/core';
import { checkText, sessionFolder } from '@mesa/core/browser';
import { Copy, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useRun } from '@/lib/useCommand';

/**
 * Runs the session's project check in its folder (`mesa check`): a pass is one line; a failure
 * shows its first errors and copies the log's path, as the app opens no file outside a checkout.
 */
export function RunCheckButton(props: { row: TreeRow & { project: string } }) {
  const run = useRun();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const folder = sessionFolder(props.row);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={running}
      onClick={async () => {
        setRunning(true);
        const result = await run('projects.check', {
          project: props.row.project,
          ...(folder ? { checkout: folder } : {}),
        });
        setRunning(false);
        if (!result) return;
        if (result.ok) return toast(checkText(result), 'confirmation');
        const [first, ...errors] = checkText(result).split('\n');
        toast([first, ...errors.slice(0, 3)].join('\n'), 'alert', {
          label: 'Copy log path',
          icon: Copy,
          onFollow: () => void navigator.clipboard.writeText(result.log),
        });
      }}
    >
      <ListChecks aria-hidden /> {running ? 'Checking...' : 'Run check'}
    </Button>
  );
}
