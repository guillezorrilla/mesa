import type { SlashCommand } from '@mesa/core';
import { invocation } from '@mesa/core/browser';

export type SlashGroup = { label: 'Built-in' | 'Commands' | 'Skills'; items: SlashCommand[] };

/**
 * The menu's text: `/` as the very first character and no space yet (after a space the person is
 * typing arguments). Returns what follows the slash, or undefined when the menu stays closed.
 */
export const slashQuery = (text: string) => (/^\/[^\s]*$/.test(text) ? text.slice(1) : undefined);

/** Commands matching `query` (substring of name or description), grouped Built-in, Commands, Skills. */
export function slashGroups(commands: SlashCommand[], query: string): SlashGroup[] {
  const q = query.toLowerCase();
  // The name typed in full first (/usage before /usage-credits), then a prefix, then the rest,
  // then description-only matches.
  const rank = (c: SlashCommand) => {
    const name = c.name.toLowerCase();
    return name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
  };
  const hit = commands
    .filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b));
  const groups: SlashGroup[] = [
    { label: 'Built-in', items: hit.filter((c) => c.source === 'builtin') },
    { label: 'Commands', items: hit.filter((c) => c.source !== 'builtin' && c.source !== 'skill') },
    { label: 'Skills', items: hit.filter((c) => c.source === 'skill') },
  ];
  return groups.filter((g) => g.items.length);
}

/** What the composer holds after completing `command`: its name, and a space when it takes arguments. */
export const completion = (command: SlashCommand) =>
  `${invocation(command.name)}${command.argumentHint ? ' ' : ''}`;
