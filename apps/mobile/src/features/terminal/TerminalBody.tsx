import type { PhoneDetail } from '@mesa/core/phone';
import { ErrorNote } from '@/components/ErrorNote';
import { SessionBar } from '../sessions/SessionBar';
import { SessionHeader } from '../sessions/SessionHeader';
import { SessionMenu } from '../sessions/SessionMenu';
import { TerminalOutput } from './TerminalOutput';

/**
 * A plain terminal session: its state, then its live output; its menu in its bar. `onChange`
 * reads it again after the phone changed it.
 */
export function TerminalBody({
  detail,
  error,
  onChange,
}: {
  detail: PhoneDetail;
  error?: string;
  onChange: () => void;
}) {
  return (
    <>
      <SessionBar row={detail.row}>
        <SessionMenu row={detail.row} archived={detail.archived} onDone={onChange} />
      </SessionBar>
      <TerminalOutput
        id={detail.row.id}
        header={
          <>
            {error ? <ErrorNote text={error} /> : null}
            <SessionHeader row={detail.row} now={Date.now()} />
          </>
        }
      />
    </>
  );
}
