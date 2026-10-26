/** Profile-scoped app shortcuts. Mod is Command on macOS and Control elsewhere. */
export const DEFAULT_SHORTCUTS = {
  search: 'Mod+K',
  board: 'Mod+1',
  newSession: 'Mod+N',
  switchSession: 'Mod+Shift+K',
  toggleUnread: 'Mod+Shift+U',
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
  startSession: 'Mod+Enter',
  sendFeedback: 'Mod+Enter',
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

/** Whether `value` may bind `action`: a valid shortcut, or '' (unbound) for toggleUnread alone. */
export const validShortcutFor = (action: string, value: string) =>
  validShortcut(value) || (value === '' && action === 'toggleUnread');

/**
 * A profile that bound toggleUnread's key to another action before toggleUnread existed keeps it:
 * toggleUnread is then unbound (''), and never matches a key, until a person sets it.
 */
export function unbindTakenToggleUnread(input: unknown) {
  if (!input || typeof input !== 'object' || 'toggleUnread' in input) return input;
  return Object.values(input).includes(DEFAULT_SHORTCUTS.toggleUnread)
    ? { ...input, toggleUnread: '' }
    : input;
}
