import { RotateCw } from 'lucide-react';
import { CopyField } from './CopyField';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

/** A read that failed: what failed, why, the command that fixes it when one is known, and Retry. */
export function RetryAlert(props: {
  title: string;
  message: string;
  fix?: string;
  /** Retry, when reading again can help. */
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={props.className}>
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription className="grid justify-items-start gap-2">
        <p>{props.message}</p>
        {props.fix && <CopyField value={props.fix} />}
        {props.onRetry && (
          <Button size="sm" variant="outline" onClick={props.onRetry}>
            <RotateCw aria-hidden /> Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
