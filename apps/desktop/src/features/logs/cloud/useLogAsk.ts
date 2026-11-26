import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { useCall } from '@/lib/useCommand';
import { useCloudLogsConfig } from './useCloudLogsConfig';

/** How often the answer is read while it streams. */
const STREAM_MS = 700;

/** A question about to be asked, with the filters it changes (a quick investigation's). */
type Asked = { question: string; over?: CloudFilters };

/**
 * Ask (CONTEXT.md, Ask (logs)) for one conversation: asks with `filters`, streams the answer as it
 * comes (`asking`), asks once which project's code to read when a service asked about maps to none
 * (`picking`, kept in logs.fixProjects), and owns the first prod Ask's confirmation (`confirming`
 * names the GCP projects until the person confirms or cancels).
 */
export function useLogAsk(
  filters: CloudFilters,
  conversation: string | undefined,
  onAsked: (asked: CloudAsked) => void,
) {
  const call = useCall();
  const toast = useToast();
  const { fixProjects, rememberFix } = useCloudLogsConfig();
  const [asking, setAsking] = useState<{ question: string; since: string; text: string }>();
  const [confirming, setConfirming] = useState<Asked & { projects: string[] }>();
  const [picking, setPicking] = useState<Asked & { refs: string[] }>();
  const since = asking?.since;
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(async () => {
      const live = await call('logs.asking', { since });
      if (live.ok && live.data.text)
        setAsking((now) => (now?.since === since ? { ...now, text: live.data.text } : now));
    }, STREAM_MS);
    return () => window.clearInterval(timer);
  }, [since, call]);
  const send = async ({ question, over }: Asked, allowProd = false) => {
    setAsking({ question, since: new Date().toISOString(), text: '' });
    const result = await call('logs.ask', {
      ...filters,
      ...over,
      question,
      conversation,
      allowProd,
    });
    setAsking(undefined);
    if (result.ok) {
      onAsked(result.data);
      return true;
    }
    const details = result.error.details as { reason?: string; projects?: string[] } | undefined;
    if (result.error.code === 'needs_approval' && details?.reason === 'prod_ask')
      setConfirming({ projects: details.projects ?? [], question, over });
    else toast(result.error.message);
    return false;
  };
  const ask = async (question: string, over?: CloudFilters) => {
    if (!question.trim()) return false;
    const unmapped = (over?.services ?? filters.services ?? []).filter(
      (ref) => !Object.hasOwn(fixProjects, ref),
    );
    if (unmapped.length) {
      setPicking({ question, over, refs: unmapped });
      return true;
    }
    return send({ question, over });
  };
  return {
    ask,
    busy: asking !== undefined,
    /** The question being answered and the answer so far. */
    asking,
    confirming: confirming?.projects,
    confirm: async () => {
      const asked = confirming;
      setConfirming(undefined);
      if (asked) await send(asked, true);
    },
    cancel: () => setConfirming(undefined),
    /** The services whose code project is being picked. */
    picking: picking?.refs,
    pick: async (project: string) => {
      const asked = picking;
      setPicking(undefined);
      if (!asked) return;
      await rememberFix(asked.refs, project);
      await send(asked);
    },
    cancelPick: () => setPicking(undefined),
  };
}
