import { TERMINAL_APPS } from '@mesa/core/browser';
import {
  AppWindow,
  Gauge,
  Keyboard,
  MousePointer2,
  PanelTop,
  SquareTerminal,
  TextCursorInput,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Choice, Range, TextField, Toggle } from './controls';
import { SettingRow, SettingSection } from './SettingRow';
import { useSettings } from './useSettings';

/** The editor's external command: an absolute argv with one {file} argument, as JSON. */
const argv = (text: string) => {
  try {
    const parsed: unknown = JSON.parse(text || '[]');
    if (Array.isArray(parsed) && parsed.every((arg) => typeof arg === 'string'))
      return { value: parsed };
  } catch {}
  return { error: 'Enter a JSON array of argument strings.' };
};

/** The embedded terminal, prompt keys and shortcuts, and the built-in editor. */
export function TerminalEditorSettings(props: { onShortcuts: () => void }) {
  const { config, save } = useSettings();
  const { terminal, editor } = config;
  return (
    <>
      <SettingSection
        id="terminal"
        title="Terminal"
        description="Terminal emulator, mouse, and scrolling"
        group="Terminal"
        groupIcon={SquareTerminal}
      >
        <SettingRow
          icon={Keyboard}
          title="Option as Meta"
          description="Use the Option key as the terminal Meta modifier. Disable for keyboards that use Option for characters like @."
          htmlFor="option-as-meta"
          control={
            <Toggle
              id="option-as-meta"
              path="terminal.optionAsMeta"
              checked={terminal.optionAsMeta}
            />
          }
        />
        <SettingRow
          icon={MousePointer2}
          title="Natural Mouse Selection"
          description="Click and drag to select text without holding Option."
          htmlFor="natural-selection"
          control={
            <Toggle
              id="natural-selection"
              path="terminal.naturalSelection"
              checked={terminal.naturalSelection}
            />
          }
        />
        <SettingRow
          icon={Gauge}
          title="Scroll Speed"
          description={`Terminal scroll multiplier (${terminal.scrollSpeed})`}
          htmlFor="scroll-speed"
          control={
            <Range
              id="scroll-speed"
              path="terminal.scrollSpeed"
              value={terminal.scrollSpeed}
              min={1}
              max={20}
            />
          }
        />
        <SettingRow
          icon={AppWindow}
          title="Terminal Emulator"
          description='Which terminal app to use for "Open in terminal"'
          htmlFor="terminal-app"
          control={
            <Choice
              id="terminal-app"
              path="terminal.app"
              value={terminal.app}
              options={TERMINAL_APPS.map((app) => [app, app] as const)}
            />
          }
        />
        <SettingRow
          icon={PanelTop}
          title="Open as New Tab"
          description="In WezTerm, open sessions as a new tab in an existing window instead of a new window"
          htmlFor="wezterm-new-tab"
          control={
            <Toggle
              id="wezterm-new-tab"
              path="terminal.wezTermNewTab"
              checked={terminal.wezTermNewTab}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="input"
        title="Input & Shortcuts"
        description="Prompt keys and keyboard bindings"
      >
        <SettingRow
          icon={TextCursorInput}
          title="Prompt Submit"
          description="An extra key that submits a prompt in the session terminal"
          htmlFor="submit-shortcut"
          control={
            <Choice
              id="submit-shortcut"
              path="terminal.extraSubmitKey"
              value={terminal.extraSubmitKey}
              options={[
                ['none', 'Enter only'],
                ['cmd-enter', 'Also Cmd+Enter'],
              ]}
            />
          }
        />
        <SettingRow
          icon={TextCursorInput}
          title="Prompt Newline"
          description="The key that inserts a newline instead of submitting"
          htmlFor="newline-shortcut"
          control={
            <Choice
              id="newline-shortcut"
              path="terminal.newlineKey"
              value={terminal.newlineKey}
              options={[
                ['native', "The agent's own"],
                ['shift-enter', 'Shift+Enter'],
              ]}
            />
          }
        />
        <SettingRow
          icon={Keyboard}
          title="Keyboard Shortcuts"
          description="Customize keybindings for Mesa actions"
          control={
            <Button size="sm" variant="secondary" onClick={props.onShortcuts}>
              Customize
            </Button>
          }
        />
      </SettingSection>
      <SettingSection
        id="editor"
        title="Editor"
        description="External editor and built-in editor behavior"
      >
        <SettingRow
          title="Vim Mode"
          description="Use Vim keybindings in the built-in file editor."
          htmlFor="editor-vim"
          control={<Toggle id="editor-vim" path="editor.vim" checked={editor.vim} />}
        />
        <SettingRow
          title="Wrap lines"
          description="Wrap long lines in the built-in editor instead of scrolling sideways."
          htmlFor="editor-word-wrap"
          control={
            <Toggle id="editor-word-wrap" path="editor.wordWrap" checked={editor.wordWrap} />
          }
        />
        <SettingRow
          title="Editor font size"
          description={`Built-in editor text size (${editor.fontSize}px)`}
          htmlFor="editor-font-size"
          control={
            <Range
              id="editor-font-size"
              path="editor.fontSize"
              value={editor.fontSize}
              min={10}
              max={24}
            />
          }
        />
        <SettingRow
          title="Tab size"
          description="Spaces a Tab inserts in the built-in editor"
          htmlFor="editor-tab-size"
          control={
            <Choice
              id="editor-tab-size"
              path="editor.tabSize"
              value={String(editor.tabSize) as '2' | '4' | '8'}
              toValue={Number}
              options={[
                ['2', '2'],
                ['4', '4'],
                ['8', '8'],
              ]}
            />
          }
        />
        <SettingRow
          title="Editor command"
          description="Used by Open externally: an absolute executable with a {file} argument and optional {line}."
          htmlFor="editor-external"
          control={
            <TextField
              id="editor-external"
              value={editor.external.length ? JSON.stringify(editor.external) : ''}
              placeholder='e.g. ["/usr/bin/open","-a","TextEdit","{file}"]'
              className="w-80 font-mono text-xs"
              parse={argv}
              onSave={(value) => save('editor.external', value)}
            />
          }
        />
      </SettingSection>
    </>
  );
}
