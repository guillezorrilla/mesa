import { useState } from 'react';
import type { PrRef } from '@/lib/client/prs';
import { runSteps, type StartStep } from '@/lib/runSteps';
import { useRun } from '@/lib/useCommand';

/**
 * Starts a review session on the PR, or finds the one running: one `mesa prs start`, which reads
 * the PR (with my last comments on a re-review), checks out its head and opens the session.
 * `steps` is what StartProgress shows; it opens `session` on its own once done. `note` says when
 * Post now was asked but a drafts review was already running, so it was not applied.
 */
export function useStartReview(ref: PrRef) {
  const run = useRun();
  const [steps, setSteps] = useState<StartStep[]>();
  const [session, setSession] = useState<string>();
  const [note, setNote] = useState<string>();
  /** Starts the review as `label` says the one step does. */
  const start = (post: boolean, label: string) => {
    setSession(undefined);
    setNote(undefined);
    return runSteps(
      [
        {
          label,
          run: async () => {
            const started = await run('prs.start', { ...ref, ...(post ? { post: true } : {}) });
            if (started?.existing && post && started.mode === 'drafts')
              setNote('A drafts review of this PR is running, so Post now was not applied.');
            if (started) setSession(started.session);
            return started;
          },
        },
      ],
      setSteps,
    );
  };
  return { steps, session, note, start, reset: () => setSteps(undefined) };
}
