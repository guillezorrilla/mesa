import { SLOW_MS } from '../mac/slowCall';
import { useMacRead } from '../mac/useMacRead';

/** The review queue across the Mac's projects; each read asks every repo through gh or twg. */
export const usePrs = () => useMacRead({ method: 'prs' }, SLOW_MS);
