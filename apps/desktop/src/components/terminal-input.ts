import type { Config } from '@mesa/core';

type Key = Pick<
  KeyboardEvent,
  'type' | 'key' | 'keyCode' | 'isComposing' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>;

/** Only explicit shortcuts override xterm; native provider keys and paste remain untouched. */
export function terminalInputForKey(
  key: Key,
  settings: Pick<Config['terminal'], 'extraSubmitKey' | 'newlineKey'>,
): string | null {
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
