import {
  TERMINAL_PRESET_IDS,
  TERMINAL_PRESETS,
  type TerminalColors,
  type TerminalPaletteChoice,
} from '@mesa/core/browser';
import { label } from '../controls/options';
import { PaletteCard } from './PaletteCard';

/** The palettes to pick from, as cards: Follow, each preset, then Custom. */
export function PalettePicker(props: {
  active: TerminalPaletteChoice | 'custom';
  /** The custom colors, shown on its card while it is active. */
  shown: TerminalColors;
  onPick: (theme: TerminalPaletteChoice) => void;
  onCustomize: () => void;
}) {
  const { active } = props;
  return (
    <fieldset className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-2 gap-y-3">
      <legend className="sr-only">Terminal palette</legend>
      <PaletteCard
        label="Follow"
        title="Mesa Dark or Mesa Light, with the interface theme"
        colors={TERMINAL_PRESETS['mesa-light'].colors}
        split={TERMINAL_PRESETS['mesa-dark'].colors}
        active={active === 'follow'}
        testId="terminal-palette-follow"
        onPick={() => props.onPick('follow')}
      />
      {TERMINAL_PRESET_IDS.map((id) => (
        <PaletteCard
          key={id}
          label={label(id)}
          colors={TERMINAL_PRESETS[id].colors}
          active={active === id}
          testId={`terminal-palette-${id}`}
          onPick={() => props.onPick(id)}
        />
      ))}
      <PaletteCard
        label="Custom"
        title="Your own colors, starting from the palette shown"
        colors={active === 'custom' ? props.shown : undefined}
        active={active === 'custom'}
        testId="terminal-palette-custom"
        onPick={props.onCustomize}
      />
    </fieldset>
  );
}
