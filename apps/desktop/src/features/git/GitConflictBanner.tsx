import type { GitOperation } from '@mesa/core';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

const NAMES: Record<GitOperation, string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
};

/**
 * A merge, rebase or cherry-pick stopped on conflicts, with Resolve with AI, which hands them to
 * the session working in the checkout (`mesa git resolve`) and says which session got them.
 */
export function GitConflictBanner(props: {
  target: { project: string; checkout?: string };
  operation: GitOperation;
  conflicted: number;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const resolve = () =>
    act(async () => {
      const handed = await run('git.resolve', props.target);
      if (!handed) return undefined;
      return {
        text:
          handed.how === 'sent'
            ? `Sent the conflicts to session ${handed.session}`
            : `Started session ${handed.session} to resolve the conflicts`,
        tone: 'confirmation' as const,
      };
    });
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b bg-state-failed/10 px-3 py-2 text-sm"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0 text-state-failed" />
      <span className="min-w-0 flex-1 truncate">
        {NAMES[props.operation]} in progress: {props.conflicted} conflicted{' '}
        {props.conflicted === 1 ? 'file' : 'files'}
      </span>
      <Button size="sm" variant="outline" disabled={acting} onClick={() => void resolve()}>
        <Sparkles aria-hidden />
        Resolve with AI
      </Button>
    </div>
  );
}
