import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { PromptBody } from './PromptBody';
import { usePrompt } from './usePrompt';

/** A waiting session's pending prompt, read from the Mac and answered from the phone. */
export function PromptCard({ id }: { id: string }) {
  const { prompt, outcome, answering, sending, answer } = usePrompt(id);
  return (
    <Suspense fallback={<BusyLine label="Reading the prompt..." />}>
      <PromptBody
        read={prompt}
        outcome={outcome}
        busy={answering ? `Sending ${sending ?? 'your answer'}...` : undefined}
        onAnswer={answer}
      />
    </Suspense>
  );
}
