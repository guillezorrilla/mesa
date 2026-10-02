/**
 * Shortcuts Mesa fixes rather than the profile: the Keyboard Shortcuts dialog lists them, and the
 * screen that acts on each checks it with `pressed`.
 */
export const FIXED_SHORTCUTS = {
  keyboardShortcuts: 'Mod+/',
  goToFile: 'Mod+P',
  findInFiles: 'Mod+Shift+F',
} as const;

/** Whether a key event is exactly `shortcut`: Mod is Command or Control, with the same modifiers. */
export function pressed(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  shortcut: string,
) {
  const parts = shortcut.split('+');
  const key = parts.at(-1)?.toLowerCase();
  return (
    (event.metaKey || event.ctrlKey) === parts.includes('Mod') &&
    event.shiftKey === parts.includes('Shift') &&
    event.altKey === parts.includes('Alt') &&
    event.key.toLowerCase() === key
  );
}

/** "Mod+Shift+F" as the key caps a Mac shows: ⌘ ⇧ F. */
export const keyCaps = (shortcut: string) =>
  shortcut
    .split('+')
    .map((part) => ({ Mod: '⌘', Shift: '⇧', Alt: '⌥' })[part] ?? part.toUpperCase());
