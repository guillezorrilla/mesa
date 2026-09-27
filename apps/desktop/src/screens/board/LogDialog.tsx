import type { ManagedRow } from '@mesa/core';
import { NO_OUTPUT_LOG, sessionLabel } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { useCommand } from '@/lib/useCommand';

/** How many of its last lines the dialog shows: as many as the session's receipt keeps. */
const LINES = 200;

/**
 * A session's last output lines, as plain text from its output log (`mesa logs`), scrolled to the
 * newest; Refresh reads them again. A session with no log says why it may have none.
 */
export function LogDialog(props: { row: ManagedRow; onClose: () => void }) {
  const { data, busy, refresh } = useCommand('sessions.logs', { id: props.row.id, tail: LINES });
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (data && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [data]);
  const said = !data
    ? undefined
    : !data.path
      ? `No output log: ${NO_OUTPUT_LOG}.`
      : !data.lines.length
        ? 'Nothing printed yet.'
        : undefined;
  return (
    <ActionDialog
      testId="log-dialog"
      wide
      title={`Log of ${sessionLabel(props.row)}`}
      description={`The last ${LINES} lines it printed, as plain text.`}
      submit={{
        label: (
          <>
            <RefreshCw aria-hidden />
            Refresh
          </>
        ),
        testId: 'log-refresh',
        disabled: busy,
      }}
      onSubmit={() => refresh()}
      onCancel={props.onClose}
    >
      {said ? (
        <p data-testid="log-said" className="text-muted-foreground text-sm">
          {said}
        </p>
      ) : (
        <pre
          ref={box}
          data-testid="log-lines"
          className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-words"
        >
          {data?.lines.join('\n')}
        </pre>
      )}
    </ActionDialog>
  );
}
