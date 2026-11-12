import type { CallResult } from '@mesa/core/phone';
import { Suspense, use } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { ErrorNote } from '@/components/ErrorNote';
import { Section } from '@/components/Section';
import type { MacRead } from '../mac/tryCall';
import { useMacRead } from '../mac/useMacRead';
import { PushesForm } from './PushesForm';

/** The Mac tab's Pushes: the settings once the Mac answers, why not when it does not. */
export function PushesSection() {
  const { answer } = useMacRead({ method: 'pushes' });
  return (
    <Section title="Pushes">
      <Suspense fallback={<BusyLine label="Asking your Mac..." />}>
        <PushesRead answer={answer} />
      </Suspense>
    </Section>
  );
}

function PushesRead({ answer }: { answer: Promise<MacRead<CallResult<'pushes'>>> }) {
  const { result, error } = use(answer);
  if (result) return <PushesForm initial={result} />;
  return <ErrorNote text={error ?? 'Your Mac did not answer.'} />;
}
