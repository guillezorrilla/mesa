import { MesaError } from '@mesa/core';

// Checks on what a command was given, before core sees it.

/** `tmux attach` needs a terminal on stdin. */
export function requireTty(tty: boolean) {
  if (!tty) {
    throw new MesaError('usage', 'not a terminal: run this in one, or use mesa attach --app');
  }
}

/** A typed argument as a whole number; core checks its range. */
export function wholeNumber(value: string, name: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(n)) {
    throw new MesaError('usage', `${name} must be a whole number, not ${value}`);
  }
  return n;
}
