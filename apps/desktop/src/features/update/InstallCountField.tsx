import { Switch } from '@/components/ui/switch';
import { SettingRow } from '@/features/settings/SettingRow';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';

/**
 * Settings > General's switch for the anonymous install count (ADR-0026): on sends the install
 * ID, version and channel once a day; off stops it and asks the broker to erase it.
 */
export function InstallCountField() {
  const installs = useCommand('installs');
  const call = useCall();
  const { acting, act } = useAct();
  return (
    <SettingRow
      title="Anonymous install count"
      description="Once a day Mesa sends a random install ID, its version and its update channel, so its maker can count installs and updates. Nothing about your work or how you use Mesa. Off also erases it."
      keywords="privacy analytics telemetry install"
      htmlFor="install-count"
      control={
        installs.data && (
          <Switch
            id="install-count"
            checked={installs.data.enabled}
            disabled={acting}
            onCheckedChange={(enabled) =>
              void act(async () => {
                const set = await call('installs.set', { enabled });
                await installs.refresh();
                if (!set.ok) return { text: set.error.message, tone: 'alert' };
                if (set.data.erased === false)
                  return {
                    text: "Turned off. The erase didn't reach Mesa's server; switch it on and off again when online.",
                    tone: 'alert',
                  };
                return undefined;
              })
            }
          />
        )
      }
    />
  );
}
