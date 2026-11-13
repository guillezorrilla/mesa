import { useLineSelection } from '@/lib/useLineSelection';
import { SLOW_MS } from '../mac/slowCall';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useDiffPages } from './useDiffPages';

/**
 * One changed file's diff screen: its pages, the lines tapped, and a note on new-side lines
 * `line` to `end` (0 for the whole file) sent to the session's agent.
 */
export function useDiff(id: string, path: string, rev: string) {
  const link = useMac();
  const sendNote = (lines: { line: number; end: number }, text: string) =>
    tryCall(link, () => link.call({ method: 'note', id, path, ...lines, text }, SLOW_MS));
  return { ...useDiffPages(id, path, rev), ...useLineSelection(), sendNote };
}
