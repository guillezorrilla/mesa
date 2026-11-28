import { RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { CopyField } from './CopyField';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

/**
 * A read that failed: what failed, why, what fixes it (the command to copy, or the caller's own
 * fix), and Retry.
 */
export function RetryAlert(props: {
  title: string;
  message: string;
  fix?: string;
  /** Retry, when reading again can help. */
  onRetry?: () => void;
  className?: string;
  /** What fixes it, in place of Copy for `fix`. */
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive" className={props.className}>
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription className="grid justify-items-start gap-2">
        <p>{props.message}</p>
        {props.children ?? (props.fix && <CopyField value={props.fix} />)}
        {props.onRetry && (
          <Button size="sm" variant="outline" onClick={props.onRetry}>
            <RotateCw aria-hidden /> Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
