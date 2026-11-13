import type { PhoneDetail } from '@mesa/core/phone';
import { Stack } from 'expo-router';
import { ErrorNote } from '@/components/ErrorNote';
import { SessionHeader } from '../sessions/SessionHeader';
import { SessionMenu } from '../sessions/SessionMenu';
import { TerminalOutput } from './TerminalOutput';
import { useTerminalOutput } from './useTerminalOutput';

/**
 * A plain terminal session: its state, then its live output; its menu in the header. `onChange`
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
  const lines = useTerminalOutput(detail.row.id, detail.tail);
  return (
    <>
      <Stack.Screen
        options={{
          title: detail.row.title,
          headerRight: () => (
            <SessionMenu row={detail.row} archived={detail.archived} onDone={onChange} />
          ),
        }}
      />
      <TerminalOutput
        lines={lines}
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
