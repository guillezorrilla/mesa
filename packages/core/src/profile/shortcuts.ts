/** Profile-scoped app shortcuts. Mod is Command on macOS and Control elsewhere. */
export const DEFAULT_SHORTCUTS = {
  search: 'Mod+K',
  board: 'Mod+1',
  newSession: 'Mod+N',
  switchSession: 'Mod+Shift+K',
} as const;

export type ShortcutAction = keyof typeof DEFAULT_SHORTCUTS;
export type Shortcuts = Record<ShortcutAction, string>;

/**
 * Shortcuts Mesa fixes rather than the profile: the Keyboard Shortcuts dialog and the command
 * palette show them, and the screen that acts on each checks it.
 */
export const FIXED_SHORTCUTS = {
  keyboardShortcuts: 'Mod+/',
  goToFile: 'Mod+P',
  findInFiles: 'Mod+Shift+F',
} as const;

const RESERVED = new Set(['Mod+Q', 'Mod+W', 'Mod+R', 'Mod+H', 'Mod+M']);

/** Canonical, simple combinations that do not take common window/browser controls. */
export const validShortcut = (value: string): boolean =>
  /^Mod\+(?:Shift\+)?(?:Alt\+)?[A-Z0-9]$/.test(value) && !RESERVED.has(value);

export function shortcutFromKeys(keys: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): string | undefined {
  if (!keys.metaKey && !keys.ctrlKey) return undefined;
  const key = keys.key.toUpperCase();
  if (!/^[A-Z0-9]$/.test(key)) return undefined;
  const value = `Mod+${keys.shiftKey ? 'Shift+' : ''}${keys.altKey ? 'Alt+' : ''}${key}`;
  return validShortcut(value) ? value : undefined;
}
