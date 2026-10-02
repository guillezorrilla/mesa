import type { SourceId } from '@mesa/core';
import { Button } from '@/components/ui/button';
import { useConnect } from '@/lib/useConnect';
import type { BrowseError } from './useSourceChildren';

/** Whether a browse failed for want of a connection: core names the source to connect. */
const toConnect = (error: BrowseError) =>
  typeof error.details === 'object' && error.details !== null && 'connect' in error.details;

/**
 * Why a node's children did not load, and for a source not connected or needing reconnecting, a
 * Connect or Reconnect button: Settings > Connections' sign-in, then `onRetry`.
 */
export function SourceError(props: { source: SourceId; error: BrowseError; onRetry: () => void }) {
  const { source, error } = props;
  const { signingIn, connect: signIn } = useConnect();
  const connect = async () => {
    if (await signIn(source)) props.onRetry();
  };
  return (
    <div data-testid="source-error" className="flex items-center gap-2 px-2 py-1 text-sm">
      <span className="min-w-0 flex-1 text-destructive">{error.message}</span>
      {toConnect(error) ? (
        <Button size="sm" variant="secondary" disabled={signingIn} onClick={() => void connect()}>
          {signingIn
            ? 'Waiting for sign-in...'
            : error.code === 'not_found'
              ? 'Connect'
              : 'Reconnect'}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={props.onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
