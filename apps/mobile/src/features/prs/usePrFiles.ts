import { useViewed } from '../changes/useChanges';
import { SLOW_MS } from '../mac/slowCall';
import { useMacRead } from '../mac/useMacRead';

/** A PR's changed files, and which of them were marked viewed. */
export function usePrFiles(project: string, number: number) {
  const read = useMacRead({ method: 'prChanges', project, number }, SLOW_MS);
  return { ...read, ...useViewed(`pr:${project}#${number}`) };
}
