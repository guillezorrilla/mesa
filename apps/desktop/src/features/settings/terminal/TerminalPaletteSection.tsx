import { TERMINAL_PRESET_IDS } from '@mesa/core/browser';
import { label } from '../controls/options';
import { SettingRow } from '../SettingRow';
import { SettingSection } from '../SettingSection';
import { ColorEditor } from './ColorEditor';
import { LeaveCustomDialog } from './LeaveCustomDialog';
import { PalettePicker } from './PalettePicker';
import { PalettePreview } from './PalettePreview';
import { useTerminalPalette } from './useTerminalPalette';

/**
 * Settings > General's Terminal palette: the palettes to pick from, a preview, and an editor for
 * the 20 colors (useTerminalPalette holds what each changes).
 */
export function TerminalPaletteSection() {
  const palette = useTerminalPalette();
  const { active, shown, confirming } = palette;
  return (
    <SettingSection
      id="terminal-palette"
      title="Terminal palette"
      description="The colors of session terminals; Mesa's own interface keeps its theme"
    >
      <SettingRow
        title="Palette"
        description={`${label(active)} in session terminals`}
        keywords={`terminal theme colors custom follow ${TERMINAL_PRESET_IDS.map(label).join(' ')}`}
      >
        <PalettePicker
          active={active}
          shown={shown}
          onPick={palette.pick}
          onCustomize={palette.customize}
        />
      </SettingRow>
      <SettingRow
        title="Preview"
        description="A prompt, git diff and ls --color in the palette shown"
        keywords="terminal palette preview"
      >
        <PalettePreview colors={shown} />
      </SettingRow>
      <SettingRow
        title="Colors"
        description={
          active === 'custom'
            ? 'Your custom palette, saved as you edit'
            : `Editing a color starts a custom palette from ${label(active)}`
        }
        keywords="terminal palette colors custom ansi background foreground cursor selection"
      >
        <ColorEditor colors={shown} onChange={palette.edit} />
      </SettingRow>
      {confirming && (
        <LeaveCustomDialog
          palette={label(confirming)}
          onConfirm={palette.confirm}
          onCancel={palette.cancel}
        />
      )}
    </SettingSection>
  );
}
