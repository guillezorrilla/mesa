import { use } from 'react';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Composer } from '../compose/Composer';
import type { Reply } from '../compose/useReply';
import { TerminalBar } from '../terminal/TerminalBar';
import { TerminalBody } from '../terminal/TerminalBody';
import { SessionBody } from './SessionBody';
import type { SessionDetail } from './useSessionDetail';

/**
 * A session as its kind shows it, once read: a plain terminal's live output over its key row and
 * command line, or an agent's conversation over its reply bar (`reply`, so its sends show in it).
 */
export function SessionView({
  id,
  session,
  reply,
}: {
  id: string;
  session: SessionDetail;
  reply: Reply;
}) {
  const { detail, error } = use(session.read);
  if (detail?.row.terminal)
    return (
      <KeyboardScreen bar={<TerminalBar id={id} />}>
        <TerminalBody detail={detail} error={error} onChange={session.again} />
      </KeyboardScreen>
    );
  return (
    <KeyboardScreen bar={<Composer reply={reply} />}>
      <SessionBody session={session} echoes={reply.send.shown} />
    </KeyboardScreen>
  );
}
