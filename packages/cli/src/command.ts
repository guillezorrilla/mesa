import type { Mesa } from '@mesa/core';

export type Flag = { type: 'string' | 'boolean'; description: string; required?: boolean };
type Flags = Record<string, Flag>;

type ArgName<S extends string> = S extends `${infer N}?` ? N : S;

/** `path` is a required argument named path; `name?` an optional one named name. */
export const parseArgSpec = (spec: string) =>
  spec.endsWith('?')
    ? { name: spec.slice(0, -1), optional: true }
    : { name: spec, optional: false };

/** Declared names to values: `path` is a string, `name?` is a string or undefined. */
type Args<A extends readonly string[]> = {
  [K in A[number] as ArgName<K>]: K extends `${string}?` ? string | undefined : string;
};

/** Declared flags to values: a required string flag is a string, the rest may be undefined. */
type FlagValues<F extends Flags> = {
  [K in keyof F]: F[K]['type'] extends 'string'
    ? F[K]['required'] extends true
      ? string
      : string | undefined
    : boolean | undefined;
};

export type Context<A extends readonly string[] = readonly string[], F extends Flags = Flags> = {
  /** Mesa's services for the resolved profile. */
  mesa: Mesa;
  args: Args<A>;
  flags: FlagValues<F>;
};

/**
 * `data` goes into the JSON envelope; `text` is what a human sees without --json.
 * `code` overrides the exit code of a successful result that still reports a problem.
 */
export type Output = { data: unknown; text: string; code?: number };

export type Command = {
  /** One or more words (`config`, `config set`); the longest name matching the input wins. */
  name: string;
  summary: string;
  /** Positional arguments in order; a trailing `?` marks one optional. */
  args?: readonly string[];
  flags?: Flags;
  run: (ctx: Context) => Output | Promise<Output>;
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
    run: (ctx: Context<A, F>) => Output | Promise<Output>;
  },
): Command {
  // The table holds commands of many shapes; each one's own types were checked above.
  return spec as unknown as Command;
}
