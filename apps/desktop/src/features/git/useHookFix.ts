import { Sparkles } from 'lucide-react';
import { useRef } from 'react';
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
  // The hook can run for minutes: a second click while it does would start a second session.
  const fixing = useRef(false);
  const fix = async () => {
    if (fixing.current) return;
    fixing.current = true;
    const fixed = await run('git.fix', target).finally(() => {
      fixing.current = false;
    });
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
