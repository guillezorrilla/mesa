import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import {
  createMesa,
  type Env,
  exitCode,
  type MesaDeps,
  MesaError,
  ok,
  type Result,
  resolveProfileName,
  toFail,
} from '@mesa/core';
import {
  type Command,
  type Flag,
  GLOBAL_FLAGS,
  type Invocation,
  type Output,
  parseArgSpec,
} from './command.js';
import { commandHelp, groupUsage, mainHelp, usage, usageWithSubcommands } from './help/usage.js';

export const VERSION: string = createRequire(import.meta.url)('../package.json').version;

export type CliDeps = {
  commands: Command[];
  /** Read for MESA_PROFILE only. */
  env: Env;
  /** Whether stdin is a terminal. */
  tty: boolean;
  stdin: () => Promise<string>;
  /** What Mesa's services are built from, once the profile is known. */
  mesa: MesaDeps;
};

export type CliResult = { code: number; stdout: string; stderr: string; exec?: string[] };

function parse(argv: string[], flags: Record<string, Flag>) {
  try {
    return parseArgs({ args: argv, options: flags, allowPositionals: true, strict: true });
  } catch (error) {
    throw new MesaError('usage', error instanceof Error ? error.message : String(error));
  }
}

/** The command whose name is the longest word prefix of the positionals. */
function match(commands: Command[], words: string[]): Command | undefined {
  const fits = (c: Command) => c.name.split(' ').every((w, i) => words[i] === w);
  return commands.filter(fits).sort((a, b) => b.name.length - a.name.length)[0];
}

/** Maps positionals to the declared argument names, or fails with the derived usage. */
function bindArgs(command: Command, given: string[], commands: Command[]): Record<string, string> {
  const specs = (command.args ?? []).map(parseArgSpec);
  const required = specs.filter((a) => !a.optional).length;
  if (given.length < required || given.length > specs.length) {
    throw new MesaError('usage', usageWithSubcommands(command, commands));
  }
  return Object.fromEntries(given.map((value, i) => [specs[i]?.name ?? '', value]));
}

function checkRequiredFlags(command: Command, values: Record<string, unknown>): void {
  const missing = Object.entries(command.flags ?? {}).find(
    ([name, f]) => f.required && values[name] === undefined,
  );
  if (missing) throw new MesaError('usage', `--${missing[0]} is required. ${usage(command)}`);
}

const say = (text: string): Output => ({ data: text, text });

async function dispatch(argv: string[], deps: CliDeps): Promise<Output> {
  // A first, non-strict pass finds the command wherever the global flags sit.
  const words = parseArgs({
    args: argv,
    options: GLOBAL_FLAGS,
    allowPositionals: true,
    strict: false,
  }).positionals;
  const command = match(deps.commands, words);
  // Global flags win over a command flag of the same name.
  const { values, positionals } = parse(argv, { ...command?.flags, ...GLOBAL_FLAGS });

  if (values.version) return say(VERSION);
  if (words.length === 0) return say(mainHelp(deps.commands, GLOBAL_FLAGS));
  if (!command) throw new MesaError('usage', groupUsage(words[0] ?? '', deps.commands));
  if (values.help) return say(commandHelp(command, deps.commands, GLOBAL_FLAGS));
  const args = bindArgs(command, positionals.slice(command.name.split(' ').length), deps.commands);
  checkRequiredFlags(command, values);
  const profile = resolveProfileName(values.profile as string | undefined, deps.env);
  const mesa = createMesa(profile, deps.mesa);
  const { tty, stdin, commands } = deps;
  return command.run({ mesa, args, flags: values, tty, stdin, commands } as Invocation);
}

/** Runs one CLI invocation and returns what to print; the entrypoint writes the streams. */
export async function runCli(argv: string[], deps: CliDeps): Promise<CliResult> {
  // Scanned before parsing so a parse error still honours --json; `--` ends flags.
  const end = argv.indexOf('--');
  const json = (end === -1 ? argv : argv.slice(0, end)).includes('--json');
  let result: Result<unknown>;
  let out: Output | undefined;
  try {
    out = await dispatch(argv, deps);
    result = ok(out.data);
  } catch (error) {
    result = toFail(error);
  }
  const code = out?.code ?? exitCode(result);
  const exec = result.ok ? out?.exec : undefined;
  if (json) return { code, stdout: `${JSON.stringify(result)}\n`, stderr: '', exec };
  if (result.ok) return { code, stdout: `${out?.text ?? ''}\n`, stderr: '', exec };
  return { code, stdout: '', stderr: `${result.error.message}\n` };
}
