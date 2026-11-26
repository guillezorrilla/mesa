import type { ReactNode } from 'react';
import { Muted } from './Muted';

/**
 * A list's state in the middle of its space: loading or empty in a muted line, a failure as an
 * alert, with an optional action under it.
 */
export function CenteredState(props: { message: ReactNode; alert?: boolean; action?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center font-sans">
      {props.alert ? (
        <p role="alert" className="max-w-md text-xs text-state-failed">
          {props.message}
        </p>
      ) : (
        <Muted className="max-w-sm">{props.message}</Muted>
      )}
      {props.action}
    </div>
  );
}
