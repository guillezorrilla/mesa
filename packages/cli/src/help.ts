import type { CommandReference } from '@mesa/core';
import { type Command, type Flag, parseArgSpec } from './command.js';
import { columns } from './format.js';

/** `--agent <string>` for a string flag, `--attach` for a boolean one. */
const flagWord = (name: string, type: Flag['type']) =>
  `--${name}${type === 'string' ? ' <string>' : ''}`;

const flagRows = (flags: Record<string, Flag>) =>
  columns(
    Object.entries(flags).map(([name, f]) => [flagWord(name, f.type), f.description]),
    '  ',
  );

const argWords = (command: Command) =>
  (command.args ?? []).map(parseArgSpec).map((a) => (a.optional ? `[${a.name}]` : `<${a.name}>`));

const subcommandsOf = (command: Command, commands: Command[]) =>
  commands.filter((c) => c.name.startsWith(`${command.name} `));

export const commandRows = (commands: Command[]) =>
  columns(
    commands.map((c) => [[c.name, ...argWords(c)].join(' '), c.summary]),
    '  ',
  );

const requiredFlagWords = (command: Command) =>
  Object.entries(command.flags ?? {})
    .filter(([, f]) => f.required)
    .map(([name, f]) => flagWord(name, f.type));

export const usage = (command: Command) =>
  [
    'Usage: mesa',
    command.name,
    ...argWords(command),
    ...requiredFlagWords(command),
    '[flags]',
  ].join(' ');

export function mainHelp(commands: Command[], globals: Record<string, Flag>): string {
  return [
    'Usage: mesa [global flags] <command> [flags]',
    '',
    'Commands:',
    ...columns(
      commands.map((c) => [[c.name, ...argWords(c)].join(' '), c.summary]),
      '  ',
    ),
    '',
    'Global flags (before or after the command):',
    ...flagRows(globals),
  ].join('\n');
}

/** The usage line, plus the subcommands when the command has any (`config` lists `config set`). */
export function usageWithSubcommands(command: Command, commands: Command[]): string {
  const subs = subcommandsOf(command, commands);
  return subs.length
    ? [usage(command), '', 'Subcommands:', ...commandRows(subs)].join('\n')
    : usage(command);
}

export function commandHelp(
  command: Command,
  commands: Command[],
  globals: Record<string, Flag>,
): string {
  const own = command.flags ?? {};
  return [
    usageWithSubcommands(command, commands),
    '',
    command.summary,
    '',
    'Flags:',
    ...(Object.keys(own).length ? flagRows(own) : ['  (none)']),
    '',
    'Global flags:',
    ...flagRows(globals),
  ].join('\n');
}

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
    "Every mesa command, generated from the CLI's own command table. In a usage line `<x>` is required and `[x]` is optional; every argument is a string.",
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
