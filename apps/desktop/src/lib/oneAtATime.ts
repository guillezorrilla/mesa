/**
 * `task` run one at a time: a call while it runs is not a second run beside it but one more run
 * right after it, however many calls came meanwhile, so the last run sees the latest state and
 * the runs never finish out of order.
 */
export function oneAtATime(task: () => Promise<void>): () => Promise<void> {
  let running = false;
  let again = false;
  return async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await task();
      } while (again);
    } finally {
      running = false;
    }
  };
}
