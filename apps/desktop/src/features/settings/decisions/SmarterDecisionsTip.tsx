import type { Config } from '@mesa/core';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import { useRun } from '@/lib/useCommand';
import { useOpenSettings } from '../useOpenSettings';

/**
 * The workspace's one tip that Smarter decisions exist, for people who never open Settings: shown
 * while the profile has no Decision model, onboarding is over, and it was never closed. Set up
 * opens Settings on Smarter decisions; closing it writes `onboarding.decisionTip: dismissed`, so
 * it never comes back.
 */
export function SmarterDecisionsTip(props: { config: Config | undefined; onChanged: () => void }) {
  const openSettings = useOpenSettings();
  const run = useRun();
  const [closed, setClosed] = useState(false);
  const { config } = props;
  if (
    closed ||
    !openSettings ||
    config?.decisions?.model !== 'none' ||
    config.onboarding?.status === 'active' ||
    config.onboarding?.decisionTip === 'dismissed'
  )
    return null;
  const dismiss = async () => {
    setClosed(true);
    if (await run('config.set', { path: 'onboarding.decisionTip', value: 'dismissed' }))
      props.onChanged();
  };
  return (
    <WorkspaceCard
      testId="smarter-decisions-tip"
      label="Tip"
      icon={Sparkles}
      title="Make Mesa smarter"
      line="Connect a free decision model so each session gets the right project notes at the right time."
      action={
        <Button size="sm" variant="secondary" onClick={() => openSettings('decisions')}>
          Set up
        </Button>
      }
      closeLabel="Close tip"
      onClose={() => void dismiss()}
    />
  );
}
