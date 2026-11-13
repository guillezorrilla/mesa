import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { HistoryList } from './HistoryList';

/** The newest past conversations, or those `query` finds; key it by query. */
export function HistoryResults({ query }: { query: string }) {
  const { answer } = useMacRead({ method: 'history', ...(query ? { query } : {}) });
  return (
    <Suspense fallback={<BusyScreen label="Reading past conversations..." />}>
      <HistoryList history={answer} query={query} />
    </Suspense>
  );
}
