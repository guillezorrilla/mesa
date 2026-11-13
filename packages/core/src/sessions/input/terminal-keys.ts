// The keys a person presses in a plain terminal session, by tmux's names: the phone's key row and
// `mesa keys` send these, and nothing else is pressed as a key. Free of Node, so the phone's
// protocol checks them too.

/** The named keys: Escape, Tab, Enter and the arrows. */
export const NAMED_KEYS = ['Escape', 'Tab', 'Enter', 'Up', 'Down', 'Left', 'Right'] as const;

/** Whether `key` is one a terminal takes: a named key, or Ctrl and a letter (`C-c`). */
export const isTerminalKey = (key: string) =>
  (NAMED_KEYS as readonly string[]).includes(key) || /^C-[a-z]$/.test(key);
