import { type Command, type Flag, parseArgSpec } from './command.js';
import { columns } from './format.js';

const flagRows = (flags: Record<string, Flag>) =>
  columns(
    Object.entries(flags).map(([name, f]) => [
      `--${name}${f.type === 'string' ? ' <value>' : ''}`,
      f.description,
    ]),
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
    .map(([name, f]) => `--${name}${f.type === 'string' ? ' <value>' : ''}`);

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
