import type { Config, DoctorReport } from '@mesa/core';
import { KeyboardShortcutsDialog } from '@/features/help/KeyboardShortcutsDialog';
import type { SettingsCategory } from '@/features/settings/categories';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { UsageDialog } from '@/features/usage/UsageDialog';
import type { CommandState } from '@/lib/useCommand';
import type { Overlay, WorkspaceView } from './navigation';

/** The dialogs that open over the current view: Keyboard shortcuts, Settings, and Usage. */
export function WorkspaceOverlays(props: {
  overlay: Overlay | undefined;
  onOverlay: (overlay: Overlay | undefined) => void;
  settingsCategory: SettingsCategory | undefined;
  config: CommandState<Config>;
  doctor: CommandState<DoctorReport>;
  /** Reloads the project list. */
  onProjectsChanged: () => void;
  navigate: (view: WorkspaceView) => void;
  onReplayTour: () => void;
}) {
  const { overlay, onOverlay, config, doctor, navigate } = props;
  return (
    <>
      <KeyboardShortcutsDialog
        open={overlay === 'shortcuts'}
        onOpenChange={(open) => onOverlay(open ? 'shortcuts' : undefined)}
        shortcuts={config.data?.shortcuts}
        onChanged={() => void config.refresh()}
      />
      <SettingsDialog
        open={overlay === 'settings'}
        onOpenChange={(open) => onOverlay(open ? 'settings' : undefined)}
        category={props.settingsCategory}
        doctor={doctor.data}
        doctorBusy={doctor.busy}
        onRecheck={() => void doctor.refresh()}
        onNavigate={(kind) => navigate({ kind })}
        onChanged={() => {
          void config.refresh();
          // A project's terminal theme override reaches its sessions through the project list.
          props.onProjectsChanged();
        }}
        onReplayTour={props.onReplayTour}
      />
      <UsageDialog
        open={overlay === 'usage'}
        onOpenChange={(open) => onOverlay(open ? 'usage' : undefined)}
        onSession={(id) => navigate({ kind: 'session', id })}
      />
    </>
  );
}
