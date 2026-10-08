import { CODEX_REVIEW_TITLE, HOOKS_UPDATE_DETAIL } from '@mesa/core/browser';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import { useAct } from '@/lib/useAct';
import { useCommand } from '@/lib/useCommand';
import { useUpdateHooks } from './useUpdateHooks';

/**
 * The workspace card for hooks Mesa installed once that are now out of date (`needsUpdate`): after
 * an upgrade, or once a Decision model wants Antigravity's mesa-decisions entry. Update hooks
 * installs them and reads the status again; when that changed Codex's hooks, the card turns into
 * the one note on approving them in Codex. Closing either hides it until the app opens again.
 */
export function HooksUpdateCard() {
  const hooks = useCommand('hooks.status');
  const update = useUpdateHooks();
  const { acting, act } = useAct();
  const [closed, setClosed] = useState(false);
  const [codexReview, setCodexReview] = useState<string>();
  if (codexReview)
    return (
      <WorkspaceCard
        testId="codex-review-note"
        label="Notice"
        icon={ShieldCheck}
        title={CODEX_REVIEW_TITLE}
        line={codexReview}
        closeLabel="Close note"
        onClose={() => setCodexReview(undefined)}
      />
    );
  if (closed || !hooks.data?.needsUpdate) return null;
  return (
    <WorkspaceCard
      testId="hooks-update-card"
      label="Notice"
      icon={RefreshCw}
      title="Mesa's session hooks need an update"
      line={HOOKS_UPDATE_DETAIL}
      action={
        <Button
          size="sm"
          variant="secondary"
          disabled={acting}
          onClick={() =>
            void act(async () => {
              const updated = await update();
              await hooks.refresh();
              if (updated?.codexReview) setCodexReview(updated.codexReview);
              return warningOf(updated?.result);
            })
          }
        >
          {acting ? 'Updating...' : 'Update hooks'}
        </Button>
      }
      closeLabel="Close notice"
      onClose={() => setClosed(true)}
    />
  );
}
