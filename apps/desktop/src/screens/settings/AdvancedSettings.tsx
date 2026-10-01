import { AGENT_LABELS, AGENT_NAMES, DECISIONS_BACKENDS } from '@mesa/core/browser';
import { Archive, BrainCircuit, DollarSign, ExternalLink, Library } from 'lucide-react';
import { warned } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { Choice, TextField } from './controls';
import { SettingRow, SettingSection } from './SettingRow';
import { useSettings } from './useSettings';

/** Faro's decisions, and where the profile's data lives and is backed up. */
export function AdvancedSettings(props: { onBackup: () => void; onUsage: () => void }) {
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
          title="Backend"
          description="Rules decide alone, or rules first with the adapter below the threshold."
          htmlFor="decisions-backend"
          control={
            <Choice
              id="decisions-backend"
              path="decisions.backend"
              value={config.decisions.backend}
              options={DECISIONS_BACKENDS.map((backend) => [backend, backend] as const)}
            />
          }
        />
        <SettingRow
          title="Adapter agent"
          description="The agent asked in headless mode when rules are not confident."
          htmlFor="decisions-adapter"
          control={
            <Choice
              id="decisions-adapter"
              path="decisions.adapter"
              value={config.decisions.adapter}
              options={AGENT_NAMES.map((agent) => [agent, AGENT_LABELS[agent]] as const)}
            />
          }
        />
        <SettingRow
          title="Confidence threshold"
          description="Below this confidence, a decision goes to the adapter (0 to 1)."
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
              onClick={() => void act(async () => warned((await run('vault.open'))?.warning))}
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
