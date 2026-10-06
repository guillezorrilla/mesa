import type { Config } from '@mesa/core';

type Key = Pick<
  KeyboardEvent,
  'type' | 'key' | 'keyCode' | 'isComposing' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>;

/**
 * Only explicit shortcuts override xterm; native provider keys and paste remain untouched. The
 * bytes a key sends instead, '' to swallow it, or null to leave it to xterm.
 */
export function terminalInputForKey(
  key: Key,
  settings: Pick<Config['terminal'], 'extraSubmitKey' | 'newlineKey'>,
  hasSelection = false,
): string | null {
  // A drag copies through tmux (OSC 52), so xterm has nothing selected: Cmd+C would reach the
  // disabled Edit > Copy and macOS would beep. With nothing to copy, the key does nothing.
  if (
    key.type === 'keydown' &&
    key.key.toLowerCase() === 'c' &&
    key.metaKey &&
    !key.altKey &&
    !key.ctrlKey &&
    !key.shiftKey &&
    !hasSelection
  )
    return '';
  if (key.type !== 'keydown' || key.key !== 'Enter' || key.isComposing || key.keyCode === 229)
    return null;
  if (
    settings.extraSubmitKey === 'cmd-enter' &&
    key.metaKey &&
    !key.altKey &&
    !key.ctrlKey &&
    !key.shiftKey
  )
    return '\r';
  if (
    settings.newlineKey === 'shift-enter' &&
    key.shiftKey &&
    !key.altKey &&
    !key.ctrlKey &&
    !key.metaKey
  )
    return '\n';
  return null;
}
