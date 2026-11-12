import { Suspense } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { BusyScreen } from '@/components/BusyScreen';
import { Composer } from '../compose/Composer';
import { SessionBody } from './SessionBody';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open, with the reply box under it. */
export function SessionScreen({ id }: { id: string }) {
  const { read, again } = useSessionDetail(id);
  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
      <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
        <SessionBody read={read} onChange={again} />
      </Suspense>
      <Composer id={id} onSent={again} />
    </KeyboardAvoidingView>
  );
}
