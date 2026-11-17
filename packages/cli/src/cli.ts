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
  type Stdio,
  toFail,
} from '@mesa/core';
import {
  type Command,
  type Flag,
  GLOBAL_FLAGS,
  type Invocation,
  type Output,
  parseArgSpec,
  renamedUsage,
} from './command.js';
import { commandHelp, groupUsage, mainHelp, usage, usageWithSubcommands } from './help/usage.js';
import type { RunOne } from './serve.js';
import { VERSION } from './version.js';

export type CliDeps = {
  commands: Command[];
  /** Read for MESA_PROFILE only. */
  env: Env;
  /** Whether stdin is a terminal. */
  tty: boolean;
  stdin: () => Promise<string>;
  /** Asks the person at the terminal yes or no; none when stdin is not one. */
  confirm?: (question: string) => Promise<boolean>;
  /** Asks the person at the terminal for a secret, not echoed; none when stdin is not one. */
  askSecret?: (question: string) => Promise<string>;
  /** What Mesa's services are built from, once the profile is known. */
  mesa: MesaDeps;
  /** A call `mesa serve` runs, whose stdout carries replies: a command that serves is refused. */
  served?: boolean;
  /** A call the Command socket forwarded: a command that runs as its own process is refused too. */
  forwarded?: boolean;
  /**
   * The processes a call starts, in `env` and `cwd`: a call the Command socket forwards starts
   * them as its caller would (ADR-0032); none keeps these deps' own.
   */
  forEnv?: (env: Env, cwd: string) => Pick<MesaDeps, 'run' | 'spawn'>;
};

type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
  exec?: string[];
  /** Run on the process's stdio, which nothing else was printed to. */
  serve?: (io: Stdio) => Promise<void>;
  /** Refused under `mesa serve` as a command that runs in its own process. */
  ownProcess?: true;
};

/** A command refused under `mesa serve` (Command.serves, and Command.ownProcess when forwarded). */
class OwnProcess extends MesaError {
  constructor(name: string) {
    super('usage', `mesa serve: ${name} serves; run it as its own process`);
  }
}

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

/**
 * Maps positionals to the declared argument names, the rest of them to a last `words...`, or
 * fails with the derived usage.
 */
function bindArgs(
  command: Command,
  given: string[],
  commands: Command[],
): Record<string, string | string[]> {
  const specs = (command.args ?? []).map(parseArgSpec);
  const rest = specs.at(-1)?.rest ? specs.pop() : undefined;
  const required = specs.filter((a) => !a.optional).length;
  if (given.length < required || (!rest && given.length > specs.length)) {
    throw new MesaError('usage', usageWithSubcommands(command, commands));
  }
  const args: Record<string, string | string[]> = Object.fromEntries(
    given.slice(0, specs.length).map((value, i) => [specs[i]?.name ?? '', value]),
  );
  if (rest) args[rest.name] = given.slice(specs.length);
  return args;
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
  const loose = parseArgs({
    args: argv,
    options: GLOBAL_FLAGS,
    allowPositionals: true,
    strict: false,
  });
  const words = loose.positionals;
  // Before the strict parse, so a renamed command's flags still reach the message; --version wins.
  const renamed = renamedUsage(argv);
  if (renamed && loose.values.version) return say(VERSION);
  if (renamed) throw new MesaError('usage', renamed);
  const command = match(deps.commands, words);
  // Global flags win over a command flag of the same name.
  const { values, positionals } = parse(argv, { ...command?.flags, ...GLOBAL_FLAGS });

  if (values.version) return say(VERSION);
  if (words.length === 0) return say(mainHelp(deps.commands, GLOBAL_FLAGS));
  if (!command) throw new MesaError('usage', groupUsage(words[0] ?? '', deps.commands));
  if (values.help) return say(commandHelp(command, deps.commands, GLOBAL_FLAGS));
  const args = bindArgs(command, positionals.slice(command.name.split(' ').length), deps.commands);
  checkRequiredFlags(command, values);
  if (deps.served && (command.serves?.(values) || (deps.forwarded && command.ownProcess?.(values))))
    throw new OwnProcess(command.name);
  const profile = resolveProfileName(values.profile as string | undefined, deps.env);
  const mesa = createMesa(profile, deps.mesa);
  const { tty, stdin, askSecret, commands } = deps;
  // No terminal and no one to ask; started now, with its own argv (receipts, hook budgets).
  const { confirm: _confirm, askSecret: _askSecret, ...unprompted } = deps;
  const rerun: RunOne = (next, input, caller) =>
    runCli(next, {
      ...unprompted,
      tty: false,
      served: true,
      forwarded: Boolean(caller),
      stdin: typeof input === 'string' ? async () => input : input,
      env: caller?.env ?? deps.env,
      mesa: {
        ...deps.mesa,
        ...(caller && {
          env: caller.env,
          cwd: caller.cwd,
          ...deps.forEnv?.(caller.env, caller.cwd),
        }),
        argv: next,
        processStartedAt: caller?.startedAt ?? deps.mesa.clock(),
      },
    });
  // A caller reading --json output is a program, which cannot answer a question.
  const confirm = values.json ? undefined : deps.confirm;
  return command.run({
    mesa,
    args,
    flags: values,
    tty,
    stdin,
    confirm,
    askSecret,
    commands,
    rerun,
  } as Invocation);
}

/** Runs one CLI invocation and returns what to print; the entrypoint writes the streams. */
export async function runCli(argv: string[], deps: CliDeps): Promise<CliResult> {
  // Scanned before parsing so a parse error still honours --json; `--` ends flags.
  const end = argv.indexOf('--');
  const json = (end === -1 ? argv : argv.slice(0, end)).includes('--json');
  let result: Result<unknown>;
  let out: Output | undefined;
  let own = {};
  try {
    out = await dispatch(argv, deps);
    result = ok(out.data);
  } catch (error) {
    result = toFail(error);
    if (error instanceof OwnProcess) own = { ownProcess: true };
  }
  const code = out?.code ?? exitCode(result);
  const exec = result.ok ? out?.exec : undefined;
  // A server's stdout is its protocol's alone: no envelope, no text.
  const serve = result.ok ? out?.serve : undefined;
  if (serve)
    return {
      code,
      stdout: '',
      stderr: '',
      // A server may run another command in this process (`chat --follow`'s requests): no spawn.
      serve: (io) =>
        serve({
          ...io,
          run: (more) =>
            runCli(more, {
              ...deps,
              tty: false,
              stdin: async () => '',
              confirm: undefined,
              askSecret: undefined,
              mesa: { ...deps.mesa, argv: more },
            }).then((ran) => ran.stdout),
        }),
    };
  if (json) return { code, stdout: `${JSON.stringify(result)}\n`, stderr: '', exec, ...own };
  if (result.ok) return { code, stdout: `${out?.text ?? ''}\n`, stderr: '', exec };
  return { code, stdout: '', stderr: `${result.error.message}\n`, ...own };
}
