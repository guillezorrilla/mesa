import type { CommandReference } from '@mesa/core';
import { type Command, type Flag, parseArgSpec } from './command.js';
import { columns } from './format.js';

/** `--agent <string>` for a string flag, `--attach` for a boolean one. */
const flagWord = (name: string, f: Flag) => `--${name}${f.type === 'string' ? ' <string>' : ''}`;

const flagRows = (flags: Record<string, Flag>) =>
  columns(
    Object.entries(flags).map(([name, f]) => [flagWord(name, f), f.description]),
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
    .map(([name, f]) => flagWord(name, f));

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

/** The usage line with every flag, the optional ones in brackets. */
const synopsis = (command: Command) =>
  [
    'mesa',
    command.name,
    ...argWords(command),
    ...Object.entries(command.flags ?? {}).map(([name, f]) =>
      f.required ? flagWord(name, f) : `[${flagWord(name, f)}]`,
    ),
  ].join(' ');

/** What `mesa help --agent --json` prints: every command in the table, in its order. */
export const reference = (commands: Command[]): CommandReference[] =>
  commands.map((c) => ({
    name: c.name,
    usage: synopsis(c),
    description: c.summary,
    args: (c.args ?? []).map(parseArgSpec).map((a) => ({ name: a.name, required: !a.optional })),
    flags: Object.entries(c.flags ?? {}).map(([name, f]) => ({
      name,
      type: f.type,
      required: f.required ?? false,
      description: f.description,
    })),
    example: c.example,
  }));

const flagItems = (flags: Record<string, Flag>) =>
  Object.entries(flags).map(
    ([name, f]) => `- \`${flagWord(name, f)}\`${f.required ? ' (required)' : ''}: ${f.description}`,
  );

const commandSection = (c: Command) =>
  [
    `### \`${synopsis(c)}\``,
    '',
    c.summary,
    '',
    ...(Object.keys(c.flags ?? {}).length ? [...flagItems(c.flags ?? {}), ''] : []),
    `Example: \`${c.example}\``,
  ].join('\n');

/**
 * `mesa help --agent`: the whole command table as Markdown, one section per group (a command's
 * first word, so `vault init` sits with `vault open`), for agents inside sessions to read.
 */
export function agentReference(commands: Command[], globals: Record<string, Flag>): string {
  // ES2022 has no Map.groupBy. A Map keeps the groups in the table's order.
  const groups = new Map<string, Command[]>();
  for (const c of commands) {
    const group = c.name.split(' ')[0] ?? '';
    groups.set(group, [...(groups.get(group) ?? []), c]);
  }
  return [
    '# mesa command reference',
    '',
    "Every mesa command, generated from the CLI's own command table. In a usage line `<x>` is required and `[x]` is optional; every argument is a string.",
    '',
    'With `--json`, a command prints one envelope on stdout: `{"ok":true,"data":...}`, or `{"ok":false,"error":{"code":...,"message":...}}`. A nonzero exit code means it failed, or found a problem it reports in `data` (`mesa doctor`, `mesa vault status`).',
    '',
    'Global flags go before or after the command:',
    '',
    ...flagItems(globals),
    ...[...groups].flatMap(([group, members]) => [
      '',
      `## ${group}`,
      ...members.flatMap((c) => ['', commandSection(c)]),
    ]),
    '',
  ].join('\n');
}
