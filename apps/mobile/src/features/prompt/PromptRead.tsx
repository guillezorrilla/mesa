import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { PromptBody } from './PromptBody';
import type { Choice } from './useAnswer';
import { usePromptRead } from './usePromptRead';

/** One pending prompt, read from the Mac when shown; keyed by the prompt, so a new one reads anew. */
export function PromptRead(props: {
  id: string;
  answered: boolean;
  busy?: string;
  onAnswer: (choice: Choice) => void;
}) {
  const read = usePromptRead(props.id);
  return (
    <Suspense fallback={<BusyLine label="Reading the prompt..." />}>
      <PromptBody read={read} {...props} />
    </Suspense>
  );
}
