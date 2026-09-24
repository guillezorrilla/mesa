import { parseArgs } from 'node:util';
import { exitCode, MesaError, ok, type Result, resolveProfile, toFail, VERSION } from '@mesa/core';

export type Flag = { type: 'string' | 'boolean'; description: string };

export type Context = {
  flags: Record<string, string | boolean | undefined>;
  args: string[];
  profile: string;
};

/** `data` goes into the JSON envelope; `text` is what a human sees without --json. */
export type Output = { data: unknown; text: string };

export type Command = {
  name: string;
  summary: string;
  flags?: Record<string, Flag>;
  run: (ctx: Context) => Output | Promise<Output>;
};

export type CliResult = { code: number; stdout: string; stderr: string };

const GLOBAL_FLAGS: Record<string, Flag> = {
  profile: {
    type: 'string',
    description: 'Select the profile (default: MESA_PROFILE, else "default")',
  },
  json: { type: 'boolean', description: 'Print the result envelope as JSON on stdout' },
  help: { type: 'boolean', description: 'Show help' },
  version: { type: 'boolean', description: 'Print the version' },
};

function flagLines(flags: Record<string, Flag>): string[] {
  const rows = Object.entries(flags).map(([name, f]): [string, string] => [
    `--${name}${f.type === 'string' ? ' <value>' : ''}`,
    f.description,
  ]);
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`);
}

export function mainHelp(commands: Command[]): string {
  const width = Math.max(...commands.map((c) => c.name.length));
  return [
    'Usage: mesa [global flags] <command> [flags]',
    '',
    'Commands:',
    ...commands.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
    '',
    'Global flags (before or after the command):',
    ...flagLines(GLOBAL_FLAGS),
  ].join('\n');
}

export function commandHelp(command: Command): string {
  const own = command.flags ?? {};
  return [
    `Usage: mesa ${command.name} [flags]`,
    '',
    command.summary,
    '',
    'Flags:',
    ...(Object.keys(own).length ? flagLines(own) : ['  (none)']),
    '',
    'Global flags:',
    ...flagLines(GLOBAL_FLAGS),
  ].join('\n');
}

function parse(argv: string[], flags: Record<string, Flag>) {
  try {
    return parseArgs({ args: argv, options: flags, allowPositionals: true, strict: true });
  } catch (error) {
    throw new MesaError('usage', error instanceof Error ? error.message : String(error));
  }
}

const say = (text: string): Output => ({ data: text, text });

async function dispatch(
  argv: string[],
  commands: Command[],
  env: NodeJS.ProcessEnv,
): Promise<Output> {
  // A first, non-strict pass finds the command name wherever the global flags sit.
  const [name] = parseArgs({
    args: argv,
    options: GLOBAL_FLAGS,
    allowPositionals: true,
    strict: false,
  }).positionals;
  const command = commands.find((c) => c.name === name);
  // Global flags win over a command flag of the same name.
  const { values, positionals } = parse(argv, { ...command?.flags, ...GLOBAL_FLAGS });

  if (values.version) return say(VERSION);
  if (name === undefined) return say(mainHelp(commands));
  if (!command)
    throw new MesaError('usage', `Unknown command: ${name}. Run mesa --help for the list.`);
  if (values.help) return say(commandHelp(command));
  const profile = resolveProfile({ flag: values.profile as string | undefined, env });
  return command.run({ flags: values, args: positionals.slice(1), profile });
}

/** Runs one CLI invocation against a command table; the caller writes the streams. */
export async function runCli(
  argv: string[],
  commands: Command[],
  env: NodeJS.ProcessEnv,
): Promise<CliResult> {
  // Scanned before parsing so a parse error still honours --json; `--` ends flags.
  const end = argv.indexOf('--');
  const json = (end === -1 ? argv : argv.slice(0, end)).includes('--json');
  let result: Result<unknown>;
  let text = '';
  try {
    const out = await dispatch(argv, commands, env);
    result = ok(out.data);
    text = out.text;
  } catch (error) {
    result = toFail(error);
  }
  const code = exitCode(result);
  if (json) return { code, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
  if (result.ok) return { code, stdout: `${text}\n`, stderr: '' };
  return { code, stdout: '', stderr: `${result.error.message}\n` };
}
