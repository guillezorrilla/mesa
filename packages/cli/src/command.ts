import { parseArgs } from 'node:util';
import type { Mesa, Stdio } from '@mesa/core';

export type Flag = {
  type: 'string' | 'boolean';
  description: string;
  required?: boolean;
  /** A string flag given once per value (`--probability a=0.7 --probability b=0.3`). */
  multiple?: boolean;
};
type Flags = Record<string, Flag>;

/** Flags every command takes, before or after its name; one wins over a command flag of its name. */
export const GLOBAL_FLAGS: Record<string, Flag> = {
  profile: {
    type: 'string',
    description: 'Select the profile (default: MESA_PROFILE, else "default")',
  },
  json: { type: 'boolean', description: 'Print the result envelope as JSON on stdout' },
  help: { type: 'boolean', description: 'Show help' },
  version: { type: 'boolean', description: 'Print the version' },
};

/**
 * First words that once named a command, mapped to the word that does now. They are not
 * commands, so help never lists them; invoking one is a usage error naming its successor.
 */
export const RENAMED: Readonly<Record<string, string>> = { rules: 'instructions' };

/**
 * `mesa rules list` gives "renamed to mesa instructions list": the first positional is
 * rewritten, global flags and their values skipped. None when that word was not renamed.
 */
export function renamedUsage(argv: string[]): string | undefined {
  const { tokens } = parseArgs({
    args: argv,
    options: GLOBAL_FLAGS,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  const first = tokens.find((t) => t.kind === 'positional');
  if (first?.kind !== 'positional' || !Object.hasOwn(RENAMED, first.value)) return;
  const now = RENAMED[first.value];
  return `renamed to mesa ${argv.map((a, i) => (i === first.index ? now : a)).join(' ')}`;
}

type ArgName<S extends string> = S extends `${infer N}?` ? N : S extends `${infer N}...` ? N : S;

/**
 * `path` is a required argument named path; `name?` an optional one named name; `words...`, last,
 * takes every word left, none or many (after `--`, words that start with `-` too).
 */
export const parseArgSpec = (spec: string) =>
  spec.endsWith('...')
    ? { name: spec.slice(0, -3), optional: true, rest: true }
    : spec.endsWith('?')
      ? { name: spec.slice(0, -1), optional: true, rest: false }
      : { name: spec, optional: false, rest: false };

/** Declared names to values: `path` is a string, `name?` a string or undefined, `words...` a list. */
type Args<A extends readonly string[]> = {
  [K in A[number] as ArgName<K>]: K extends `${string}...`
    ? string[]
    : K extends `${string}?`
      ? string | undefined
      : string;
};

/**
 * Declared flags to values: a required string flag is a string, a multiple one a list, the rest
 * may be undefined.
 */
type FlagValues<F extends Flags> = {
  [K in keyof F]: F[K]['type'] extends 'string'
    ? F[K]['multiple'] extends true
      ? string[] | undefined
      : F[K]['required'] extends true
        ? string
        : string | undefined
    : boolean | undefined;
};

export type Invocation<A extends readonly string[] = readonly string[], F extends Flags = Flags> = {
  /** Mesa's services for the resolved profile. */
  mesa: Mesa;
  args: Args<A>;
  flags: FlagValues<F>;
  /** Whether stdin is a terminal, which `tmux attach` needs. */
  tty: boolean;
  /** All of stdin, read on demand (a hook's payload). */
  stdin: () => Promise<string>;
  /**
   * Asks the person a yes-or-no question (a guardrail's ask): only in a terminal and without
   * --json, else undefined.
   */
  confirm: ((question: string) => Promise<boolean>) | undefined;
  /** The command table, which `mesa help` describes. */
  commands: Command[];
};

/**
 * `data` goes into the JSON envelope; `text` is what a human sees without --json.
 * `code` overrides the exit code of a successful result that still reports a problem.
 */
export type Output = {
  data: unknown;
  text: string;
  code?: number;
  /** An argv the entrypoint replaces the process with after printing (`mesa open --attach`). */
  exec?: string[];
  /** A loop the entrypoint runs on its stdio in place of printing (`mesa vault mcp`). */
  serve?: (io: Stdio) => Promise<void>;
};

export type Command = {
  /** One or more words (`config`, `config set`); the longest name matching the input wins. */
  name: string;
  summary: string;
  /** Positional arguments in order; a trailing `?` marks one optional, `...` the rest of the words. */
  args?: readonly string[];
  flags?: Flags;
  /** One invocation an agent can copy; a test checks it parses as this command. */
  example: string;
  run: (invocation: Invocation) => Output | Promise<Output>;
};

/**
 * A command whose `run` sees its declared arguments and flags by name and type. The runner checks
 * arity and required flags before `run`, so the types hold.
 */
export function defineCommand<
  const A extends readonly string[] = [],
  const F extends Flags = Record<never, Flag>,
>(
  spec: Omit<Command, 'args' | 'flags' | 'run'> & {
    args?: A;
    flags?: F;
    run: (invocation: Invocation<A, F>) => Output | Promise<Output>;
  },
): Command {
  // The table holds commands of many shapes; each one's own types were checked above.
  return spec as unknown as Command;
}
