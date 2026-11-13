import { use } from 'react';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Composer } from '../compose/Composer';
import { TerminalBar } from '../terminal/TerminalBar';
import { TerminalBody } from '../terminal/TerminalBody';
import { SessionBody } from './SessionBody';
import type { DetailRead } from './useSessionDetail';

/**
 * A session as its kind shows it, once read: a plain terminal's live output over its key row and
 * command line, or an agent's replies over its reply bar.
 */
export function SessionView({
  id,
  read,
  again,
}: {
  id: string;
  read: Promise<DetailRead>;
  again: () => void;
}) {
  const { detail, error } = use(read);
  if (detail?.row.terminal)
    return (
      <KeyboardScreen bar={<TerminalBar id={id} />}>
        <TerminalBody detail={detail} error={error} onChange={again} />
      </KeyboardScreen>
    );
  return (
    <KeyboardScreen bar={<Composer id={id} onSent={again} />}>
      <SessionBody read={read} onChange={again} />
    </KeyboardScreen>
  );
}
