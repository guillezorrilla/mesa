import type { CommandReference } from '@mesa/core';
import { type Command, type Flag, parseArgSpec } from '../command.js';
import { argWords, flagWord } from './usage.js';

// The agent reference (mesa help --agent): every command as data, and as markdown.

type FlagEntry = CommandReference['flags'][number];

const flagEntries = (flags: Record<string, Flag> = {}): FlagEntry[] =>
  Object.entries(flags).map(([name, f]) => ({
    name,
    type: f.type,
    required: f.required ?? false,
    description: f.description,
  }));

/** The usage line with every flag, the optional ones in brackets. */
const synopsis = (command: Command) =>
  [
    'mesa',
    command.name,
    ...argWords(command),
    ...flagEntries(command.flags).map((f) =>
      f.required ? flagWord(f.name, f.type) : `[${flagWord(f.name, f.type)}]`,
    ),
  ].join(' ');

/** What `mesa help --agent --json` prints: every command in the table, in its order. */
export const commandReference = (commands: Command[]): CommandReference[] =>
  commands.map((c) => ({
    name: c.name,
    usage: synopsis(c),
    description: c.summary,
    args: (c.args ?? []).map(parseArgSpec).map((a) => ({ name: a.name, required: !a.optional })),
    flags: flagEntries(c.flags),
    example: c.example,
  }));

const flagItems = (flags: FlagEntry[]) =>
  flags.map(
    (f) => `- \`${flagWord(f.name, f.type)}\`${f.required ? ' (required)' : ''}: ${f.description}`,
  );

const section = (c: CommandReference) =>
  [
    `### \`${c.usage}\``,
    '',
    c.description,
    '',
    ...(c.flags.length ? [...flagItems(c.flags), ''] : []),
    `Example: \`${c.example}\``,
  ].join('\n');

/**
 * `mesa help --agent`: the reference as Markdown, for agents inside sessions to read. One section
 * per first word, as `mesa vault` names the group of `vault init` and `vault open`.
 */
export function referenceMarkdown(
  commands: CommandReference[],
  globals: Record<string, Flag>,
): string {
  // ES2022 has no Map.groupBy. A Map keeps the groups in the table's order.
  const groups = new Map<string, CommandReference[]>();
  for (const c of commands) {
    const group = c.name.split(' ')[0] ?? '';
    groups.set(group, [...(groups.get(group) ?? []), c]);
  }
  return [
    '# mesa command reference',
    '',
    "Every mesa command, generated from the CLI's own command table. In a usage line `<x>` is required and `[x]` is optional; every argument is a string, and `[x...]` takes the rest of the words (put `--` before them when one starts with `-`).",
    '',
    'With `--json`, a command prints one envelope on stdout: `{"ok":true,"data":...}`, or `{"ok":false,"error":{"code":...,"message":...}}`. A nonzero exit code means it failed, or that it found a problem it reports in `data`.',
    '',
    'Global flags go before or after the command:',
    '',
    ...flagItems(flagEntries(globals)),
    ...[...groups].flatMap(([group, members]) => [
      '',
      `## ${group}`,
      ...members.flatMap((c) => ['', section(c)]),
    ]),
    '',
  ].join('\n');
}
