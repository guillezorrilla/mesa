import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Composer } from '../compose/Composer';
import { SessionBody } from './SessionBody';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open, with the reply bar under it. */
export function SessionScreen({ id }: { id: string }) {
  const { read, again } = useSessionDetail(id);
  return (
    <KeyboardScreen bar={<Composer id={id} onSent={again} />}>
      <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
        <SessionBody read={read} onChange={again} />
      </Suspense>
    </KeyboardScreen>
  );
}
