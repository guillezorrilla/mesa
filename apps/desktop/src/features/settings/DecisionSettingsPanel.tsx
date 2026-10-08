import type { SystemOneProvider } from '@mesa/core/browser';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ConnectModelDialog } from './decisions/ConnectModelDialog';
import { DecisionModelRow } from './decisions/DecisionModelRow';
import { MODEL_ORDER, MODELS } from './decisions/models';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/**
 * Smarter decisions: one row per hosted model, CLEF then Jev, to connect, use, replace or
 * disconnect it, as Connections lists its sources. With none in use, Faro answers with its rules
 * alone and nothing leaves this Mac.
 */
export function DecisionSettingsPanel() {
  const { config, reload } = useSettings();
  const keys = useCommand('decisions.keys');
  const run = useRun();
  const { acting, act } = useAct();
  // The model whose Connect dialog is open, and whether it was connected already (Replace).
  const [connecting, setConnecting] = useState<{ model: SystemOneProvider; replacing: boolean }>();
  const { model, cloudflareAccount, experimental = false } = config.decisions;
  const changed = async () => {
    await Promise.all([keys.refresh(), reload()]);
  };
  const runThen = (action: () => Promise<unknown>) =>
    void act(async () => {
      if (await action()) await changed();
      return undefined;
    });
  const rowOf = (hosted: SystemOneProvider) =>
    keys.data?.keys.find((row) => row.provider === MODELS[hosted].provider);
  return (
    <SettingSection
      id="models"
      title="Decision models"
      description="When its own rules are unsure, Mesa can ask a hosted decision model, so each session gets the right notes and checks. Optional: with none, nothing leaves this Mac."
    >
      {MODEL_ORDER.map((hosted) => (
        <DecisionModelRow
          key={hosted}
          model={hosted}
          row={rowOf(hosted)}
          inUse={model === hosted}
          experimental={experimental}
          acting={acting}
          onConnect={() => setConnecting({ model: hosted, replacing: rowOf(hosted)?.set === true })}
          onUse={(use) => runThen(() => run('decisions.use', { model: use ? hosted : 'none' }))}
          onDisconnect={() =>
            runThen(() => run('decisions.keys.remove', { provider: MODELS[hosted].provider }))
          }
        />
      ))}
      {model === 'none' && (
        <Muted size="xs" data-testid="decisions-rules-only" className="px-1 pt-1">
          No model in use: Mesa decides with its own rules.
        </Muted>
      )}
      {connecting && (
        <ConnectModelDialog
          model={connecting.model}
          account={cloudflareAccount}
          replacing={connecting.replacing}
          onConnected={changed}
          onClose={() => setConnecting(undefined)}
        />
      )}
    </SettingSection>
  );
}
