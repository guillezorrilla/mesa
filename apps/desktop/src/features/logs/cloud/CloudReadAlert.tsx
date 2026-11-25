import type { CloudWarning } from '@mesa/core';
import { TriangleAlert } from 'lucide-react';
import { CopyField } from '@/components/CopyField';
import { RetryAlert } from '@/components/RetryAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CommandError } from '@/lib/useCommand';

/** A failed read with its fix, or the projects that could not be read while the others were. */
export function CloudReadAlert(props: {
  error?: CommandError;
  warnings?: readonly CloudWarning[];
  /** Reads again, for a failure. */
  onRetry?: () => void;
}) {
  const fix = (props.error?.details as { fix?: string } | undefined)?.fix;
  if (props.error)
    return (
      <RetryAlert
        title="Cloud Logs could not be read"
        message={props.error.message}
        fix={fix}
        onRetry={props.onRetry}
      />
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
            {w.fix && <CopyField value={w.fix} />}
          </div>
        ))}
      </AlertDescription>
    </Alert>
  );
}
