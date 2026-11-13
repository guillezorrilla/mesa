import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { StepText } from './StepText';
import { useStepRead } from './useStepRead';

/** An opened step's text, asked from the Mac when it opens. */
export function StepDetail({ id, step }: { id: string; step: string }) {
  const read = useStepRead(id, step);
  return (
    <Suspense fallback={<BusyLine label="Reading..." />}>
      <StepText read={read} />
    </Suspense>
  );
}
