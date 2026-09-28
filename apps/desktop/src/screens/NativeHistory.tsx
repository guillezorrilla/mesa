import type { NativeHistoryRow } from '@mesa/core';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/** Native conversations in this project's checkout, with an explicit import action. */
export function NativeHistory(props: { project: string; onSession: (id: string) => void }) {
  const history = useCommand('sessions.history', { project: props.project });
  const run = useRun();
  const { act, acting } = useAct();
  const [selected, setSelected] = useState<NativeHistoryRow>();
  const importSession = () =>
    act(async () => {
      if (!selected) return undefined;
      const adopted = await run('sessions.adopt', {
        agentSessionId: selected.id,
        project: props.project,
      });
      if (!adopted) return undefined;
      setSelected(undefined);
      await history.refresh();
      props.onSession(adopted.id);
      return said(`Imported ${selected.agent} session as ${adopted.id}`, adopted);
    });
  return (
    <div
      data-testid="native-history"
      className="space-y-2 rounded-lg border bg-card/35 p-3 text-sm"
    >
      {history.busy && !history.data && <p className="text-muted-foreground">Loading history…</p>}
      {history.data?.rows.map((row) => (
        <div
          key={`${row.agent}:${row.id}`}
          className="flex items-center gap-3 border-b py-2 last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={row.cwd}>
            {row.agent} · {row.id}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={row.updatedAt}>
            {new Date(row.updatedAt).toLocaleDateString()}
          </time>
          {row.importedAs ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => row.importedAs && props.onSession(row.importedAs)}
            >
              Open
            </Button>
          ) : row.heldElsewhere ? (
            <span className="text-xs text-muted-foreground">Other profile</span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
              Import
            </Button>
          )}
        </div>
      ))}
      {history.data?.rows.length === 0 && (
        <p className="text-muted-foreground">No native conversations found in this checkout.</p>
      )}
      {history.data && history.data.total > history.data.rows.length && (
        <p className="text-xs text-muted-foreground">
          Showing the newest {history.data.rows.length} of {history.data.total}.
        </p>
      )}
      {history.data?.unsupported.map((item) => (
        <p key={item.agent} className="text-xs text-muted-foreground">
          {item.agent} history unavailable: {item.reason}
        </p>
      ))}
      {selected && (
        <ActionDialog
          testId="native-import-dialog"
          title={`Import ${selected.agent} session?`}
          description="End the session in its original terminal first. Two agents writing one native conversation can interleave its transcript."
          submit={{ label: 'Import and resume', testId: 'native-import-submit', disabled: acting }}
          onSubmit={() => void importSession()}
          onCancel={() => setSelected(undefined)}
        >
          <p className="font-mono text-xs">{selected.id}</p>
        </ActionDialog>
      )}
    </div>
  );
}
