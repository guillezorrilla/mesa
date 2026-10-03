import { RefreshCw } from 'lucide-react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { SettingRow } from '@/features/settings/SettingRow';
import { SettingSection } from '@/features/settings/SettingSection';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';
import { describeUpdate, useUpdate } from './useUpdate';

const CHANNELS = [
  ['stable', 'Stable'],
  ['beta', 'Beta'],
] as const;

/** Settings > General's Updates: the channel the profile follows, and a check on demand. */
export function UpdateSettings() {
  const { status, busy, check } = useUpdate();
  const channel = useCommand('update.channel');
  const call = useCall();
  const { acting, act } = useAct();
  return (
    <SettingSection id="updates" title="Updates" description="How Mesa keeps itself current">
      <SettingRow
        title="Channel"
        description="Beta gets new versions first, and stable releases too"
        keywords="update channel stable beta"
        control={
          channel.data && (
            <SegmentedControl
              label="Update channel"
              value={channel.data.channel}
              options={CHANNELS}
              onChange={(to) =>
                void act(async () => {
                  const set = await call('update.channel.set', { channel: to });
                  await channel.refresh();
                  if (!set.ok) return { text: set.error.message, tone: 'alert' };
                  // The check reads the new channel's feed at once.
                  await check();
                  return undefined;
                })
              }
            />
          )
        }
      />
      <SettingRow
        icon={RefreshCw}
        title="Check for updates"
        description={describeUpdate(status)}
        keywords="update version upgrade"
        control={
          <Button size="sm" variant="ghost" disabled={busy || acting} onClick={() => void check()}>
            <RefreshCw aria-hidden className={busy ? 'animate-spin' : undefined} />
            Check now
          </Button>
        }
      />
    </SettingSection>
  );
}
