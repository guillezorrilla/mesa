import type { KeyboardEvent } from 'react';

const STEP: Record<string, (at: number, last: number) => number> = {
  ArrowDown: (at, last) => Math.min(at + 1, last),
  ArrowUp: (at) => Math.max(at - 1, 0),
  Home: () => 0,
  End: (_, last) => last,
};

/** Arrow, Home and End keys move focus among the `button[data-file-row]` siblings of a list. */
export function moveListFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const buttons = [
    ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      'button[data-file-row]',
    ) ?? []),
  ];
  const at = buttons.indexOf(event.currentTarget);
  const step = STEP[event.key];
  if (at < 0 || !step) return;
  event.preventDefault();
  buttons[step(at, buttons.length - 1)]?.focus();
}
