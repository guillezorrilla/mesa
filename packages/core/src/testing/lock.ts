import type { LockDeps } from '../lib/lock-file.js';
import { fixedClock } from './clock.js';

/** Lock deps for this test process, which every holder but the ones `alive` rejects shares. */
export const lockDeps = (alive: (pid: number) => boolean = () => true): LockDeps => ({
  processId: 4242,
  processAlive: alive,
  clock: fixedClock(),
});
