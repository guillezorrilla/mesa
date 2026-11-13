import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import type { MacRead } from '../mac/tryCall';
import { PushesForm } from './PushesForm';

/** The push settings once the Mac answered, or why it did not. */
export function PushesRead({ answer }: { answer: Promise<MacRead<CallResult<'pushes'>>> }) {
  const { result, error } = use(answer);
  if (result) return <PushesForm initial={result} />;
  return <ErrorNote text={error ?? 'Your Mac did not answer.'} />;
}
