import type { DoctorReport } from '@mesa/core';
import {
  COLOR_VISION_MODES,
  INTERFACE_DENSITIES,
  INTERFACE_FONTS,
  INTERFACE_THEMES,
  TERMINAL_THEMES,
} from '@mesa/core/browser';
import { Database, Eye, Palette, Power, RefreshCw, Stethoscope, Type } from 'lucide-react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Choice, Range, TextField, Toggle } from './controls';
import { SettingRow, SettingSection } from './SettingRow';
import { useSettings } from './useSettings';

/** Words for core's choices; the choices themselves are core's, so validation and controls agree. */
const LABEL: Record<string, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
  follow: 'Follow interface theme',
  plex: 'IBM Plex Sans',
  comfortable: 'Comfortable',
  compact: 'Compact',
  normal: 'Normal',
  'red-green': 'Red-green',
  'blue-yellow': 'Blue-yellow',
};
const options = <T extends string>(values: readonly T[]) =>
  values.map((value) => [value, LABEL[value] ?? value] as const);

/** Application behaviour, appearance, accessibility, and Doctor's health checks. */
export function GeneralSettings(props: {
  doctor?: DoctorReport;
  doctorBusy: boolean;
  onRecheck: () => void;
  onDoctor: () => void;
  onReplayTour: () => void;
}) {
  const { config, acting, save } = useSettings();
  const { application, appearance, terminal } = config;
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
            <Toggle
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
            <Toggle
              id="backup-on-close"
              path="application.backupOnClose"
              checked={application.backupOnClose}
            />
          }
        />
        <SettingRow
          title="Welcome tour"
          description="Replay the first-run walkthrough at any time."
          control={
            <Button size="sm" variant="ghost" disabled={acting} onClick={props.onReplayTour}>
              Replay tour
            </Button>
          }
        />
      </SettingSection>
      <SettingSection
        id="appearance"
        title="Appearance"
        description="Interface theme, terminal theme, typography, and density"
        group="Appearance"
        groupIcon={Palette}
      >
        <SettingRow
          title="Interface theme"
          description="Application light or dark mode"
          control={
            <SegmentedControl
              label="Interface theme"
              value={appearance.theme}
              options={options(INTERFACE_THEMES)}
              onChange={(theme) => save('appearance.theme', theme)}
            />
          }
        />
        <SettingRow
          title="Terminal theme"
          description="Terminal color palette, or follow the interface theme"
          htmlFor="terminal-theme"
          control={
            <Choice
              id="terminal-theme"
              path="terminal.theme"
              value={terminal.theme}
              options={options(TERMINAL_THEMES)}
            />
          }
        />
        <SettingRow
          icon={Type}
          title="Font Size"
          description={`Terminal text size (${terminal.fontSize}px)`}
          htmlFor="terminal-font-size"
          control={
            <Range
              id="terminal-font-size"
              path="terminal.fontSize"
              value={terminal.fontSize}
              min={10}
              max={24}
            />
          }
        />
        <SettingRow
          title="Terminal Font"
          description="CSS font-family stack"
          htmlFor="terminal-font"
          control={
            <TextField
              id="terminal-font"
              value={terminal.fontFamily}
              parse={(text) =>
                text.trim() ? { value: text.trim() } : { error: 'Enter a font family.' }
              }
              onSave={(value) => save('terminal.fontFamily', value)}
            />
          }
        />
        <SettingRow
          title="Interface font"
          description="The typeface of Mesa's own text"
          htmlFor="appearance-font"
          control={
            <Choice
              id="appearance-font"
              path="appearance.font"
              value={appearance.font}
              options={options(INTERFACE_FONTS)}
            />
          }
        />
        <SettingRow
          title="Interface text size"
          description={`Mesa's own text size (${appearance.fontSize}px)`}
          htmlFor="appearance-size"
          control={
            <Range
              id="appearance-size"
              path="appearance.fontSize"
              value={appearance.fontSize}
              min={12}
              max={20}
            />
          }
        />
        <SettingRow
          title="Diff Font Size"
          description={`Code review and diff view text size (${appearance.diffFontSize}px)`}
          htmlFor="appearance-diff-size"
          control={
            <Range
              id="appearance-diff-size"
              path="appearance.diffFontSize"
              value={appearance.diffFontSize}
              min={10}
              max={20}
            />
          }
        />
        <SettingRow
          title="File Tree Font Size"
          description={`File explorer and diff sidebar text size (${appearance.fileTreeFontSize}px)`}
          htmlFor="appearance-tree-size"
          control={
            <Range
              id="appearance-tree-size"
              path="appearance.fileTreeFontSize"
              value={appearance.fileTreeFontSize}
              min={10}
              max={20}
            />
          }
        />
        <SettingRow
          title="Layout Density"
          description="Spacing between UI elements"
          htmlFor="appearance-density"
          control={
            <Choice
              id="appearance-density"
              path="appearance.density"
              value={appearance.density}
              options={options(INTERFACE_DENSITIES)}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="accessibility"
        title="Accessibility"
        description="Accessible display preferences"
      >
        <SettingRow
          icon={Eye}
          title="Color vision"
          description="Optimize state colors for color vision deficiency"
          htmlFor="appearance-colorVision"
          control={
            <Choice
              id="appearance-colorVision"
              path="appearance.colorVision"
              value={appearance.colorVision}
              options={options(COLOR_VISION_MODES)}
            />
          }
        />
      </SettingSection>
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
