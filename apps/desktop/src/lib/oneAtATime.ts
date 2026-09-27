/**
 * `task` run one at a time: a call while it runs is not a second run beside it but one more run
 * right after it, shared by every call meanwhile, so the last run sees the latest state and the
 * runs never finish out of order. Each call resolves when the run that covers it has, so a caller
 * that awaits it sees what it asked for; that run happens even if the one before it throws.
 */
export function oneAtATime(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  let queued: Promise<void> | undefined;
  const start = () => {
    const run = task().finally(() => {
      if (running === run) running = undefined;
    });
    running = run;
    return run;
  };
  return () => {
    if (!running) return start();
    queued ??= running
      .catch(() => {})
      .then(() => {
        queued = undefined;
        return start();
      });
    return queued;
  };
}
