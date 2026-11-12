import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { GateBody } from './GateBody';
import { useGate } from './useGate';

/** One open decision gate, resolved from the phone with the Decision model's advice beside it. */
export function GateScreen({ id }: { id: string }) {
  const read = useGate(id);
  return (
    <Suspense fallback={<BusyScreen label="Asking your Mac for advice..." />}>
      <GateBody read={read} />
    </Suspense>
  );
}
