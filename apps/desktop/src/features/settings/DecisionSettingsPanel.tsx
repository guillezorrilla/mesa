import { SYSTEM_ONE_PROVIDERS } from '@mesa/core/browser';
import { Cpu, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ToggleField } from './controls/ToggleField';
import { ModelKeyPanel } from './decisions/ModelKeyPanel';
import { MODELS } from './decisions/models';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/**
 * Smarter decisions: Jev and CLEF, each usable once its key is saved, and None. Faro asks the
 * model in use when its rules are unsure; with None, nothing leaves this Mac. A site runs
 * automatically only once it passed both of Mesa's gates, unless the person opts into experimental
 * automatic decisions.
 */
export function DecisionSettingsPanel() {
  const { config, reload } = useSettings();
  const keys = useCommand('decisions.keys');
  const run = useRun();
  const { acting, act } = useAct();
  const { model, cloudflareAccount, experimental = false } = config.decisions;
  const changed = async () => {
    await Promise.all([keys.refresh(), reload()]);
  };
  return (
    <>
      {SYSTEM_ONE_PROVIDERS.map((hosted) => (
        <ModelKeyPanel
          key={hosted}
          model={hosted}
          row={keys.data?.keys.find((row) => row.provider === MODELS[hosted].provider)}
          inUse={model === hosted}
          account={cloudflareAccount}
          experimental={experimental}
          onChanged={changed}
        />
      ))}
      <SettingSection
        id="experimental"
        title="Experimental"
        description="Automatic decisions before they are proven to help."
      >
        <SettingRow
          icon={FlaskConical}
          title="Automatic before proven"
          description="Also run sites that passed the quality check, but not yet the paired coding workflows, automatically. Their advice is marked experimental."
          htmlFor="decisions-experimental"
          keywords="experimental automatic paired gate"
          control={
            <ToggleField
              id="decisions-experimental"
              path="decisions.experimental"
              checked={experimental}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="none"
        title="None"
        description="Faro answers with its rules alone, and the agents work as they normally do."
      >
        <SettingRow
          icon={Cpu}
          title="Rules only"
          description="No key needed, and no session text leaves this Mac."
          keywords="off disable"
          control={
            model === 'none' ? (
              <Badge variant="secondary">In use</Badge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={acting}
                onClick={() =>
                  void act(async () => {
                    if (await run('decisions.use', { model: 'none' })) await changed();
                    return undefined;
                  })
                }
              >
                Use this one
              </Button>
            )
          }
        />
      </SettingSection>
    </>
  );
}
