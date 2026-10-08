import { Archive, BrainCircuit, DollarSign, ExternalLink, Library } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { TextField } from './controls/TextField';
import { ToggleField } from './controls/ToggleField';
import { MODELS } from './decisions/models';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/** Faro's decisions, and where the profile's data lives and is backed up. */
export function AdvancedSettingsPanel(props: { onBackup: () => void; onUsage: () => void }) {
  const { config, save } = useSettings();
  const run = useRun();
  const { acting, act } = useAct();
  return (
    <>
      <SettingSection
        id="decisions"
        title="Decisions"
        description="How Faro answers the judgments Mesa routes to it"
        group="Faro"
        groupIcon={BrainCircuit}
      >
        <SettingRow
          title="Model"
          description="Asked when the rules are unsure; choose it in Smarter decisions."
          control={
            <Muted size="xs">
              {config.decisions.model === 'none'
                ? 'Rules only'
                : MODELS[config.decisions.model].label}
            </Muted>
          }
        />
        <SettingRow
          title="Try unproven automatic decisions"
          description="Let the model act on its own where it passed the quality check but has not yet been proven to help in paired coding runs. Its advice is marked experimental."
          htmlFor="decisions-experimental"
          keywords="experimental automatic paired gate smarter"
          control={
            <ToggleField
              id="decisions-experimental"
              path="decisions.experimental"
              checked={config.decisions.experimental ?? false}
            />
          }
        />
        <SettingRow
          title="Confidence threshold"
          description="Mesa acts on an idle reading only at or above this confidence, such as delivering PR events to a session (0 to 1)."
          htmlFor="decisions-threshold"
          control={
            <TextField
              id="decisions-threshold"
              className="w-20 text-xs"
              value={String(config.decisions.threshold)}
              parse={(text) => {
                const value = Number(text);
                return text.trim() !== '' && value >= 0 && value <= 1
                  ? { value }
                  : { error: 'Enter a number from 0 to 1.' };
              }}
              onSave={(value) => save('decisions.threshold', value)}
            />
          }
        />
      </SettingSection>
      <SettingSection id="data" title="Data" description="The profile's vault, usage, and backups">
        <SettingRow
          icon={Library}
          title="Vault"
          description={config.vault}
          keywords="obsidian"
          control={
            <Button
              size="sm"
              variant="ghost"
              disabled={acting}
              onClick={() => void act(async () => warningOf(await run('vault.open')))}
            >
              Open in Obsidian <ExternalLink aria-hidden />
            </Button>
          }
        />
        <SettingRow
          icon={DollarSign}
          title="Usage and cost alerts"
          description="Estimated spend and informational limits."
          control={
            <Button size="sm" variant="secondary" onClick={props.onUsage}>
              Open Usage
            </Button>
          }
        />
        <SettingRow
          icon={Archive}
          title="Local backup"
          description="Back up or restore the profile's settings and records."
          control={
            <Button size="sm" variant="secondary" onClick={props.onBackup}>
              Open backup
            </Button>
          }
        />
      </SettingSection>
    </>
  );
}
