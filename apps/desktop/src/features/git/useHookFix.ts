import { Sparkles } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';

/**
 * A failed commit's error as a toast; in a checkout whose commit runs a pre-commit hook, with Fix
 * with AI, which hands the hook's failure to the session working there (`mesa git fix`) and says
 * which session got it.
 */
export function useHookFix(target: { project: string; checkout?: string }, hasHook: boolean) {
  const run = useRun();
  const toast = useToast();
  const fix = async () => {
    const fixed = await run('git.fix', target);
    if (!fixed) return;
    toast(
      fixed.passed
        ? 'The pre-commit hook passes now: nothing was handed over'
        : fixed.how === 'sent'
          ? `Sent the hook's failure to session ${fixed.session}`
          : `Started session ${fixed.session} to fix the hook`,
      'confirmation',
    );
  };
  return (error: string) =>
    toast(
      error,
      'alert',
      hasHook ? { label: 'Fix with AI', icon: Sparkles, onFollow: () => void fix() } : undefined,
    );
}
