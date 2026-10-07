// `data` is never set: it only carries the envelope's data type. `stdin` is what the command
// reads on stdin: a secret, which never goes in argv.
export type Spec<Args, Data> = {
  argv: (args: Args) => string[];
  stdin?: (args: Args) => string;
  data?: Data;
};
/** A command without arguments. */
export const command = <Data>(...argv: string[]): Spec<undefined, Data> => ({ argv: () => argv });
/** A command whose argv is built from its arguments. */
export const commandWith = <Args, Data>(argv: (args: Args) => string[]): Spec<Args, Data> => ({
  argv,
});
/** A command whose argv and stdin are built from its arguments: a secret goes on stdin. */
export const commandWithStdin = <Args, Data>(
  argv: (args: Args) => string[],
  stdin: (args: Args) => string,
): Spec<Args, Data> => ({ argv, stdin });

/**
 * A recorded command's data: its receipt, and a warning when the action or its receipt had one
 * (recordedOutput in the CLI puts both there).
 */
export type Recorded<T> = T & { receipt: { id: string; path: string } | null; warning?: string };
