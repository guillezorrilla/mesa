import type { CloudWarning, GcloudAction } from '@mesa/core';
import { TriangleAlert } from 'lucide-react';
import { RetryAlert } from '@/components/RetryAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CommandError } from '@/lib/useCommand';
import { GcloudFixPanel } from './GcloudFixPanel';

/**
 * A failed read with its fix (GcloudFixPanel), or the projects that could not be read while the
 * others were, each with its own.
 */
export function CloudReadAlert(props: {
  error?: CommandError;
  warnings?: readonly CloudWarning[];
  /** Reads again, for a failure and once a fix is done. */
  onRetry?: () => void;
}) {
  const details = props.error?.details as { fix?: string; action?: GcloudAction } | undefined;
  if (props.error)
    return (
      <RetryAlert
        title="Cloud Logs could not be read"
        message={props.error.message}
        onRetry={props.onRetry}
      >
        <GcloudFixPanel action={details?.action} fix={details?.fix} onFixed={props.onRetry} />
      </RetryAlert>
    );
  if (!props.warnings?.length) return null;
  return (
    <Alert>
      <TriangleAlert aria-hidden className="text-state-waiting" />
      <AlertTitle>Some of it could not be read</AlertTitle>
      <AlertDescription className="grid gap-2">
        {props.warnings.map((w) => (
          <div key={`${w.project} ${w.message}`} className="grid gap-1">
            <p>{w.message}</p>
            <GcloudFixPanel
              action={w.action}
              fix={w.fix}
              project={w.project}
              onFixed={props.onRetry}
            />
          </div>
        ))}
      </AlertDescription>
    </Alert>
  );
}
