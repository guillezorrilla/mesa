import { MesaError, TERMINAL_APPS } from '@mesa/core';

// Checks on what a command was given, before core sees it.

/** `tmux attach` needs a terminal on stdin; `instead` opens the terminal app on it. */
export function requireTty(tty: boolean, instead: string) {
  if (!tty) throw new MesaError('usage', `not a terminal: run this in one, or use ${instead}`);
}

/** What a command that shows tmux here takes to open the user's terminal app instead. */
export const APP_FLAG = {
  type: 'boolean',
  description: `Open it in the app config terminal.app names (${TERMINAL_APPS.join(', ')})`,
} as const;

/** A typed argument as a whole number; core checks its range. */
export function wholeNumber(value: string, name: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(n)) {
    throw new MesaError('usage', `${name} must be a whole number, not ${value}`);
  }
  return n;
}
