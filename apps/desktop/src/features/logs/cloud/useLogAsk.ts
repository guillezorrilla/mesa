import { useState } from 'react';
import { useToast } from '@/components/Toast';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { useCall } from '@/lib/useCommand';

/**
 * Ask (CONTEXT.md, Ask (logs)) for one conversation: asks with `filters`, and owns the first prod
 * Ask's confirmation (`confirming` names the GCP projects until the person confirms or cancels).
 */
export function useLogAsk(
  filters: CloudFilters,
  conversation: string | undefined,
  onAsked: (asked: CloudAsked) => void,
) {
  const call = useCall();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<{ projects: string[]; question: string }>();
  const ask = async (question: string, allowProd = false) => {
    if (!question.trim()) return false;
    setBusy(true);
    const result = await call('logs.ask', { ...filters, question, conversation, allowProd });
    setBusy(false);
    if (result.ok) {
      onAsked(result.data);
      return true;
    }
    const details = result.error.details as { reason?: string; projects?: string[] } | undefined;
    if (result.error.code === 'needs_approval' && details?.reason === 'prod_ask')
      setConfirming({ projects: details.projects ?? [], question });
    else toast(result.error.message);
    return false;
  };
  return {
    ask,
    busy,
    confirming: confirming?.projects,
    confirm: async () => {
      const asked = confirming;
      setConfirming(undefined);
      if (asked) await ask(asked.question, true);
    },
    cancel: () => setConfirming(undefined),
  };
}
