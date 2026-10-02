import type { SourceRow } from '@mesa/core';
import { Cable, FolderTree } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import type { DataOf } from '@/lib/client';
import { describeSource } from '@/lib/describeSource';
import type { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { useConnect } from '@/lib/useConnect';

/**
 * One card per Source (`mesa sources list`): its label, its connection, and the action that
 * fits: Browse when connected, Connect when not, Reconnect when it needs reconnecting.
 */
export function SourceCards(props: {
  sources: CommandState<DataOf<'sources.list'>>;
  acting: boolean;
  act: ReturnType<typeof useAct>['act'];
  onBrowse: (source: SourceRow) => void;
}) {
  const { signingIn, connect } = useConnect();
  const signIn = (source: SourceRow) =>
    void props.act(async () => {
      const result = await connect(source.id);
      await props.sources.refresh();
      return result && said(`Connected ${source.label}`, result);
    });
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {(props.sources.data?.sources ?? []).map((source) => (
        <li
          key={source.id}
          data-testid="source-card"
          className="flex items-start gap-3 rounded-lg border bg-card/40 p-3"
        >
          <Cable aria-hidden className="mt-0.5 size-4 shrink-0 text-ring" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-medium text-sm">{source.label}</div>
            <Muted size="xs">{describeSource(source)}</Muted>
          </div>
          {source.status === 'connected' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={props.acting}
              onClick={() => props.onBrowse(source)}
            >
              <FolderTree aria-hidden /> Browse {source.label}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={props.acting}
              onClick={() => signIn(source)}
            >
              {signingIn ? 'Waiting for sign-in...' : source.connected ? 'Reconnect' : 'Connect'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
