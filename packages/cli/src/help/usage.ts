import { type Command, type Flag, parseArgSpec } from '../command.js';
import { columns } from '../output/columns.js';

// Help for a person at a terminal: usage lines, the command list, and each command's flags.

/** `--agent <string>` for a string flag, `--attach` for a boolean one. */
export const flagWord = (name: string, type: Flag['type']) =>
  `--${name}${type === 'string' ? ' <string>' : ''}`;

const flagRows = (flags: Record<string, Flag>) =>
  columns(
    Object.entries(flags).map(([name, f]) => [flagWord(name, f.type), f.description]),
    '  ',
  );

export const argWords = (command: Command) =>
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
    ...commandRows(commands),
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

/** `mesa vault` alone names a group: its subcommands, or an unknown command's message. */
export function groupUsage(word: string, commands: Command[]): string {
  const group = commands.filter((c) => c.name.startsWith(`${word} `));
  if (!group.length) return `Unknown command: ${word}. Run mesa --help for the list.`;
  return [
    `Usage: mesa ${word} <subcommand> [flags]`,
    '',
    'Subcommands:',
    ...commandRows(group),
  ].join('\n');
}
