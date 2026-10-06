import {
  COLOR_VISION_MODES,
  INTERFACE_DENSITIES,
  INTERFACE_FONTS,
  INTERFACE_THEMES,
  TERMINAL_THEMES,
} from '@mesa/core/browser';
import { Eye, Palette, Type } from 'lucide-react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { ChoiceField } from './controls/ChoiceField';
import { options } from './controls/options';
import { RangeField } from './controls/RangeField';
import { TextField } from './controls/TextField';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

/** Settings > General's Appearance and Accessibility: themes, typography, density and colour vision. */
export function AppearanceSettingsPanel() {
  const { config, save } = useSettings();
  const { appearance, terminal } = config;
  return (
    <>
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
            <ChoiceField
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
            <RangeField
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
            <ChoiceField
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
            <RangeField
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
            <RangeField
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
            <RangeField
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
            <ChoiceField
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
            <ChoiceField
              id="appearance-colorVision"
              path="appearance.colorVision"
              value={appearance.colorVision}
              options={options(COLOR_VISION_MODES)}
            />
          }
        />
      </SettingSection>
    </>
  );
}
