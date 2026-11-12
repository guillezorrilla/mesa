import { Suspense } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { SessionBody } from './SessionBody';
import { useSessionDetail } from './useSessionDetail';

/** One session, read from the Mac and kept current while open. */
export function SessionScreen({ id }: { id: string }) {
  const read = useSessionDetail(id);
  return (
    <Suspense
      fallback={
        <View className="flex-1 bg-background p-4">
          <BusyLine label="Asking your Mac..." />
        </View>
      }
    >
      <SessionBody read={read} />
    </Suspense>
  );
}
