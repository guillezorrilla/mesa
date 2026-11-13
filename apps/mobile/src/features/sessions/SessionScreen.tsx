import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Composer } from '../compose/Composer';
import { useReply } from '../compose/useReply';
import { SessionBody } from './SessionBody';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open, with the reply bar under it. */
export function SessionScreen({ id }: { id: string }) {
  const session = useSessionDetail(id);
  const reply = useReply(id, session.again);
  return (
    <KeyboardScreen bar={<Composer reply={reply} />}>
      <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
        <SessionBody session={session} echoes={reply.send.shown} />
      </Suspense>
    </KeyboardScreen>
  );
}
