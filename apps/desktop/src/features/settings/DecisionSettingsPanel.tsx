import { SYSTEM_ONE_PROVIDERS } from '@mesa/core/browser';
import { Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ModelKeyPanel } from './decisions/ModelKeyPanel';
import { MODELS } from './decisions/models';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/**
 * Smarter decisions: Jev and CLEF, each usable once its key is saved, and None. Faro asks the
 * model in use when its rules are unsure; with None, nothing leaves this Mac.
 */
export function DecisionSettingsPanel() {
  const { config, reload } = useSettings();
  const keys = useCommand('decisions.keys');
  const run = useRun();
  const { acting, act } = useAct();
  const { model, cloudflareAccount } = config.decisions;
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
          onChanged={changed}
        />
      ))}
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
