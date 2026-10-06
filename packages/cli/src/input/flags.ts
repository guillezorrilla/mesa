import { MesaError, TERMINAL_APPS } from '@mesa/core';

// What a command is given, checked and parsed into what core takes, before core sees it.

/** `tmux attach` needs a terminal on stdin; `instead` opens the terminal app on it. */
export function requireTty(tty: boolean, instead: string) {
  if (!tty) throw new MesaError('usage', `not a terminal: run this in one, or use ${instead}`);
}

/** What a command that shows tmux here takes to open the user's terminal app instead. */
export const APP_FLAG = {
  type: 'boolean',
  description: `Open it in the app config terminal.app names (${TERMINAL_APPS.join(', ')})`,
} as const;

/** What a command that works in a project's checkout takes to pick a linked worktree instead. */
export const CHECKOUT_FLAG = {
  type: 'string',
  description: 'Select a linked worktree path',
} as const;

/** A typed argument as a whole number; core checks its range. */
export function wholeNumber(value: string, name: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(n)) {
    throw new MesaError('usage', `${name} must be a whole number, not ${value}`);
  }
  return n;
}

/** A typed argument as a number; core checks its range. */
export function decimal(value: string, name: string): number {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n)) {
    throw new MesaError('usage', `${name} must be a number, not ${value}`);
  }
  return n;
}

/** A typed `true` or `false` as a boolean. */
export function trueOrFalse(value: string, name: string): boolean {
  if (value !== 'true' && value !== 'false') {
    throw new MesaError('usage', `${name} must be true or false`);
  }
  return value === 'true';
}

/** A typed `up` or `down`, the way a list item moves. */
export function upOrDown(value: string, name: string): 'up' | 'down' {
  if (value !== 'up' && value !== 'down') {
    throw new MesaError('usage', `${name} must be up or down`);
  }
  return value;
}

/** `--probability <option>=<p>` words as {option: p}; core checks each p is from 0 to 1. */
export function probabilitiesOf(words: string[]): Record<string, number> {
  const probabilities: Record<string, number> = {};
  for (const word of words) {
    const at = word.lastIndexOf('=');
    if (at <= 0) throw new MesaError('usage', `--probability takes <option>=<p>, not ${word}`);
    const option = word.slice(0, at);
    if (Object.hasOwn(probabilities, option)) {
      throw new MesaError('usage', `--probability names ${option} twice`);
    }
    probabilities[option] = decimal(word.slice(at + 1), `--probability ${option}`);
  }
  return probabilities;
}
