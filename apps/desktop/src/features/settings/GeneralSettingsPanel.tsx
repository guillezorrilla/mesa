import type { DoctorReport } from '@mesa/core';
import { Database, FolderOpen, Library, Power, RefreshCw, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpdateSettingsPanel } from '@/features/update/UpdateSettingsPanel';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel';
import { CliLinkRow } from './CliLinkRow';
import { ToggleField } from './controls/ToggleField';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/** Application behaviour, updates, appearance, accessibility, and Doctor's health checks. */
export function GeneralSettingsPanel(props: {
  doctor?: DoctorReport;
  doctorBusy: boolean;
  onRecheck: () => void;
  onDoctor: () => void;
  onReplayTour: () => void;
}) {
  const { config, acting, save } = useSettings();
  const { pickFolder } = usePlatform();
  const { acting: picking, act } = useAct();
  const { application } = config;
  return (
    <>
      <SettingSection
        id="application"
        title="Application"
        description="Application behavior and onboarding"
        group="Quitting"
        groupIcon={Power}
      >
        <SettingRow
          icon={Power}
          title="Warn before quitting"
          description="Ask for confirmation before quitting the app"
          htmlFor="warn-before-quit"
          control={
            <ToggleField
              id="warn-before-quit"
              path="application.warnBeforeQuit"
              checked={application.warnBeforeQuit}
            />
          }
        />
        <SettingRow
          icon={Database}
          title="Backup on close"
          description="Create a local backup of the profile every time the app is closed"
          htmlFor="backup-on-close"
          control={
            <ToggleField
              id="backup-on-close"
              path="application.backupOnClose"
              checked={application.backupOnClose}
            />
          }
        />
        <SettingRow
          title="Setup guide"
          description="Walk through setup again: requirements, projects, and a first session."
          keywords="onboarding tour welcome"
          control={
            <Button size="sm" variant="ghost" disabled={acting} onClick={props.onReplayTour}>
              Run again
            </Button>
          }
        />
        <CliLinkRow />
      </SettingSection>
      <UpdateSettingsPanel />
      <SettingSection
        id="vault"
        title="Vault"
        description="Local knowledge shared by all projects in this profile"
      >
        <SettingRow
          icon={Library}
          title="Vault folder"
          description={<span className="break-all font-mono">{config.vault}</span>}
          keywords="obsidian vault folder path change"
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={acting || picking}
              onClick={() =>
                void act(async () => {
                  const folder = await pickFolder();
                  if (folder && folder !== config.vault) save('vault', folder);
                  return undefined;
                })
              }
            >
              <FolderOpen aria-hidden /> Change folder
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground">
            Choose another Obsidian vault or local folder. Existing files stay in their current
            folder. New sessions use the selected vault.
          </p>
        </SettingRow>
      </SettingSection>
      <AppearanceSettingsPanel />
      <SettingSection id="doctor" title="Doctor" description="Verify your setup is healthy">
        <SettingRow
          icon={Stethoscope}
          title="Health checks"
          description={
            props.doctor
              ? `${props.doctor.summary} · ${props.doctor.checks.filter((check) => check.status !== 'ok').length} findings`
              : 'Run diagnostic checks on your setup.'
          }
          control={
            <span className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={props.doctorBusy}
                onClick={props.onRecheck}
              >
                <RefreshCw aria-hidden className={props.doctorBusy ? 'animate-spin' : undefined} />
                Run checks
              </Button>
              <Button size="sm" variant="secondary" onClick={props.onDoctor}>
                Open Doctor
              </Button>
            </span>
          }
        />
      </SettingSection>
    </>
  );
}
