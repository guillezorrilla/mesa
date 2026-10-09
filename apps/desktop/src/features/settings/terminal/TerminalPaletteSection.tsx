import {
  TERMINAL_COLOR_KEYS,
  TERMINAL_PRESET_IDS,
  TERMINAL_PRESETS,
  TERMINAL_THEME_ALIASES,
  type TerminalColorKey,
  type TerminalColors,
  type TerminalTheme,
  terminalPalette,
} from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { useInterfaceDark } from '@/lib/useInterfaceDark';
import { options } from '../controls/options';
import { SettingRow } from '../SettingRow';
import { SettingSection } from '../SettingSection';
import { useSettings } from '../useSettings';
import { ColorEditor } from './ColorEditor';
import { PaletteCard } from './PaletteCard';
import { PalettePreview } from './PalettePreview';

type Choice = 'follow' | (typeof TERMINAL_PRESET_IDS)[number];
const label = (theme: TerminalTheme) => options([theme])[0]?.[1] ?? theme;
const same = (a: Partial<TerminalColors> | undefined, b: TerminalColors) =>
  TERMINAL_COLOR_KEYS.every((key) => a?.[key]?.toLowerCase() === b[key]);

/**
 * Settings > Appearance's Terminal palette: Follow, the 12 presets and Custom as cards, a preview,
 * and an editor for the 20 colors. Editing a color saves all 20 as Custom; leaving Custom asks
 * first, because it replaces them.
 */
export function TerminalPaletteSection() {
  const { config, acting, saveAll } = useSettings();
  const { terminal } = config;
  const dark = useInterfaceDark();
  // Colors being edited, ahead of the save: a native picker sends many while it is dragged.
  const [draft, setDraft] = useState<TerminalColors>();
  const sent = useRef<TerminalColors>(undefined);
  const [confirming, setConfirming] = useState<Choice>();
  const shown = draft ?? terminalPalette(terminal, dark);
  const active = draft ? 'custom' : (TERMINAL_THEME_ALIASES[terminal.theme] ?? terminal.theme);
  const custom = terminal.theme === 'custom';

  useEffect(() => {
    // One save at a time: a draft that comes in during one is saved after it.
    if (!draft || acting || sent.current === draft) return;
    const timer = setTimeout(() => {
      sent.current = draft;
      saveAll([
        ['terminal.colors', draft],
        ...(custom ? [] : [['terminal.theme', 'custom'] as const]),
      ]);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, acting, custom, saveAll]);
  // Saved: the profile's colors show again, so a change made elsewhere shows too.
  useEffect(() => {
    if (draft && sent.current === draft && custom && same(terminal.colors, draft))
      setDraft(undefined);
  }, [draft, custom, terminal.colors]);

  const use = (theme: Choice) => {
    setConfirming(undefined);
    setDraft(undefined);
    saveAll([['terminal.theme', theme]]);
  };
  const pick = (theme: Choice) => {
    if (theme === active) return;
    if (custom || draft) setConfirming(theme);
    else use(theme);
  };
  const edit = (key: TerminalColorKey, color: string) => setDraft({ ...shown, [key]: color });

  return (
    <SettingSection
      id="terminal-palette"
      title="Terminal palette"
      description="The colors of session terminals; Mesa's own interface keeps its theme"
    >
      <SettingRow
        title="Palette"
        description={`${label(active as TerminalTheme)} in session terminals`}
        keywords={`terminal theme colors custom follow ${TERMINAL_PRESET_IDS.map((id) => TERMINAL_PRESETS[id].label).join(' ')}`}
      >
        <fieldset className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-2 gap-y-3">
          <legend className="sr-only">Terminal palette</legend>
          <PaletteCard
            label="Follow"
            title="Mesa Dark or Mesa Light, with the interface theme"
            colors={TERMINAL_PRESETS['mesa-light'].colors}
            split={TERMINAL_PRESETS['mesa-dark'].colors}
            active={active === 'follow'}
            testId="terminal-palette-follow"
            onPick={() => pick('follow')}
          />
          {TERMINAL_PRESET_IDS.map((id) => (
            <PaletteCard
              key={id}
              label={TERMINAL_PRESETS[id].label}
              colors={TERMINAL_PRESETS[id].colors}
              active={active === id}
              testId={`terminal-palette-${id}`}
              onPick={() => pick(id)}
            />
          ))}
          <PaletteCard
            label="Custom"
            title="Your own colors, starting from the palette shown"
            colors={active === 'custom' ? shown : undefined}
            active={active === 'custom'}
            testId="terminal-palette-custom"
            onPick={() => active !== 'custom' && setDraft({ ...shown })}
          />
        </fieldset>
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
            : `Editing a color starts a custom palette from ${label(active as TerminalTheme)}`
        }
        keywords="terminal palette colors custom ansi background foreground cursor selection"
      >
        <ColorEditor colors={shown} onChange={edit} />
      </SettingRow>
      {confirming && (
        <ActionDialog
          testId="terminal-palette-confirm"
          title="Replace your custom colors?"
          description={`${label(confirming)} replaces the colors of your custom palette. Editing a color later starts a new one from ${label(confirming)}.`}
          submit={{
            label: `Use ${label(confirming)}`,
            testId: 'terminal-palette-confirm-submit',
            disabled: false,
          }}
          onSubmit={() => use(confirming)}
          onCancel={() => setConfirming(undefined)}
        >
          {null}
        </ActionDialog>
      )}
    </SettingSection>
  );
}
