import { SLOW_MS } from '../mac/slowCall';
import { useMacRead } from '../mac/useMacRead';
import { useViewed } from './useViewed';

/** A session's changed files, and which of them were marked viewed. */
export function useChanges(id: string) {
  const { answer, pull, refreshing } = useMacRead({ method: 'changes', id }, SLOW_MS);
  return { answer, pull, refreshing, ...useViewed(id) };
}
