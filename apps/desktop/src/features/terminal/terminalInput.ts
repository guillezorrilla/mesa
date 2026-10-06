import type { Config } from '@mesa/core';

type Key = Pick<
  KeyboardEvent,
  'type' | 'key' | 'keyCode' | 'isComposing' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>;

type Modifier = 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey';

/** Whether `modifier` is the one modifier held. */
const only = (key: Key, modifier: Modifier) =>
  (['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const).every((m) => key[m] === (m === modifier));

/**
 * Line editing as macOS terminals map it (iTerm2's natural text editing, Terminal.app's Option
 * arrows): readline's keys, which shells and agents all read.
 */
const LINE_KEYS: Record<string, Partial<Record<Modifier, string>>> = {
  ArrowLeft: { metaKey: '\x01', altKey: '\x1bb' },
  ArrowRight: { metaKey: '\x05', altKey: '\x1bf' },
  Backspace: { metaKey: '\x15' },
};

/**
 * Only explicit shortcuts override xterm; native provider keys and paste remain untouched. The
 * bytes a key sends instead, '' to swallow it, or null to leave it to xterm.
 */
export function terminalInputForKey(
  key: Key,
  settings: Pick<Config['terminal'], 'extraSubmitKey' | 'newlineKey'>,
  hasSelection = false,
): string | null {
  if (key.type !== 'keydown' || key.isComposing || key.keyCode === 229) return null;
  // A drag copies through tmux (OSC 52), so xterm has nothing selected: Cmd+C would reach the
  // disabled Edit > Copy and macOS would beep. With nothing to copy, the key does nothing.
  if (key.key.toLowerCase() === 'c' && only(key, 'metaKey') && !hasSelection) return '';
  for (const modifier of ['metaKey', 'altKey'] as const) {
    const bytes = LINE_KEYS[key.key]?.[modifier];
    if (bytes && only(key, modifier)) return bytes;
  }
  if (key.key !== 'Enter') return null;
  if (settings.extraSubmitKey === 'cmd-enter' && only(key, 'metaKey')) return '\r';
  if (settings.newlineKey === 'shift-enter' && only(key, 'shiftKey')) return '\n';
  return null;
}
