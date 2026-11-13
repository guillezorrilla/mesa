import { SLOW_MS } from '../mac/slowCall';
import { useMacRead } from '../mac/useMacRead';
import { usePrActions } from './usePrActions';

/** One PR's screen: the PR read through the Mac, pulled to read again, and what it can do. */
export function usePr(project: string, number: number) {
  const read = useMacRead({ method: 'pr', project, number }, SLOW_MS);
  return { ...read, actions: usePrActions({ project, number }, read.again) };
}
