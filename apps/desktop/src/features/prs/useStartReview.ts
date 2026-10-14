import type { PrDetail } from '@mesa/core';
import { useState } from 'react';
import { runSteps, type StartStep } from '@/components/StartProgress';
import { useRun } from '@/lib/useCommand';

/**
 * Starts a review session on the PR, or finds the one running: one `mesa prs start`, which reads
 * the PR (with my last comments on a re-review), checks out its head and opens the session.
 * `steps` is what StartProgress shows; it opens `session` on its own once done. `note` says when
 * Post now was asked but a drafts review was already running, so it was not applied.
 */
export function useStartReview(pr: Pick<PrDetail, 'project' | 'number' | 'bucket'>) {
  const run = useRun();
  const [steps, setSteps] = useState<StartStep[]>();
  const [session, setSession] = useState<string>();
  const [note, setNote] = useState<string>();
  const ref = { project: pr.project, number: pr.number };
  const start = (post: boolean) => {
    setSession(undefined);
    setNote(undefined);
    return runSteps(
      [
        {
          label:
            pr.bucket === 'need'
              ? 'Read the PR and check out its head'
              : 'Read the PR and your last comments, and check out its new head',
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
