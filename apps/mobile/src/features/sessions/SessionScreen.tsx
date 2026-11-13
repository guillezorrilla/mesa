import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useReply } from '../compose/useReply';
import { SessionBar } from './SessionBar';
import { SessionView } from './SessionView';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open, shown as its kind (SessionView). */
export function SessionScreen({ id }: { id: string }) {
  const session = useSessionDetail(id);
  const reply = useReply(id, session.again);
  return (
    <Suspense
      fallback={
        <>
          <SessionBar />
          <BusyScreen label="Asking your Mac..." />
        </>
      }
    >
      <SessionView id={id} session={session} reply={reply} />
    </Suspense>
  );
}
