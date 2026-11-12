import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { QuoteBody } from './QuoteBody';
import { useQuote } from './useQuote';

/** A passage of one of a session's replies, quoted with a comment to its agent. */
export function QuoteScreen({ id, reply }: { id: string; reply: string }) {
  const { answer, selection, tap } = useQuote(id);
  return (
    <>
      <Stack.Screen options={{ title: 'Quote a reply' }} />
      <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
        <QuoteBody id={id} reply={reply} answer={answer} selection={selection} onTap={tap} />
      </Suspense>
    </>
  );
}
