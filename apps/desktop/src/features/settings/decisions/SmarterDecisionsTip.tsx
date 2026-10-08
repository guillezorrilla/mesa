import type { Config } from '@mesa/core';
import { Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
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
    <aside
      data-testid="smarter-decisions-tip"
      aria-label="Tip"
      className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-xl border bg-card/60 py-2.5 pr-2 pl-3 shadow-xs"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-state-waiting/15 text-state-waiting">
        <Sparkles aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Make Mesa smarter</p>
        <Muted size="xs">
          Connect a free decision model so each session gets the right project notes at the right
          time.
        </Muted>
      </div>
      <Button size="sm" variant="secondary" onClick={() => openSettings('decisions')}>
        Set up
      </Button>
      <IconButton label="Close tip" icon={X} onClick={() => void dismiss()} />
    </aside>
  );
}
