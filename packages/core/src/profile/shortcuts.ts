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

/** A shortcut's value: a valid combination, or '' for one left unbound (unbindTakenDefaults). */
export const validBinding = (value: string) => value === '' || validShortcut(value);

/**
 * Actions added after profiles could bind their default key to another action. Such a profile
 * keeps its binding: the newer action, absent from it, is unbound ('') until a person sets it.
 * Any other clash is a person's own and is refused.
 */
const ADDED_LATER: readonly ShortcutAction[] = ['toggleUnread'];

/** Leaves each ADDED_LATER action unbound in `input` when another action holds its default key. */
export function unbindTakenDefaults(input: unknown) {
  if (!input || typeof input !== 'object') return input;
  const taken = new Set(Object.values(input));
  const unbound = ADDED_LATER.filter(
    (action) => !(action in input) && taken.has(DEFAULT_SHORTCUTS[action]),
  ).map((action) => [action, '']);
  return unbound.length ? { ...input, ...Object.fromEntries(unbound) } : input;
}
