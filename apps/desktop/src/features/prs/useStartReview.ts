import type { PrDetail } from '@mesa/core';
import { useState } from 'react';
import { runSteps, type StartStep } from '@/components/StartProgress';
import { useRun } from '@/lib/useCommand';

/**
 * Starts a review session on the PR, or finds the one running: read the PR (with my last comments
 * on a re-review), then `mesa prs start`, which checks out its head and opens the session. `steps`
 * is what StartProgress shows; it opens `session` on its own once both are done.
 */
export function useStartReview(pr: Pick<PrDetail, 'project' | 'number' | 'bucket'>) {
  const run = useRun();
  const [steps, setSteps] = useState<StartStep[]>();
  const [session, setSession] = useState<string>();
  const ref = { project: pr.project, number: pr.number };
  const start = (post: boolean) => {
    setSession(undefined);
    return runSteps(
      [
        {
          label: pr.bucket === 'need' ? 'Read the PR' : 'Read the PR and your last comments',
          run: () => run('prs.show', ref),
        },
        {
          label: 'Check out the PR head and open the review',
          run: async () => {
            const started = await run('prs.start', { ...ref, ...(post ? { post: true } : {}) });
            if (started) setSession(started.session);
            return started;
          },
        },
      ],
      setSteps,
    );
  };
  return { steps, session, start, reset: () => setSteps(undefined) };
}
