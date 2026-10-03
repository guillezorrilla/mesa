import { Archive, BrainCircuit, DollarSign, ExternalLink, Library } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { warned } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/** Faro's decisions, and where the profile's data lives and is backed up. */
export function AdvancedSettings(props: { onBackup: () => void; onUsage: () => void }) {
  const { config } = useSettings();
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
          description="Faro answers with its rules alone, so nothing waits on a model."
          control={<Muted size="xs">Rules only</Muted>}
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
