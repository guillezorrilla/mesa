// `data` is never set: it only carries the envelope's data type.
export type Spec<Args, Data> = { argv: (args: Args) => string[]; data?: Data };
/** A command without arguments. */
export const command = <Data>(...argv: string[]): Spec<undefined, Data> => ({ argv: () => argv });
/** A command whose argv is built from its arguments. */
export const commandWith = <Args, Data>(argv: (args: Args) => string[]): Spec<Args, Data> => ({
  argv,
});

/**
 * A recorded command's data: its receipt, and a warning when the action or its receipt had one
 * (recordedOutput in the CLI puts both there).
 */
export type Recorded<T> = T & { receipt: { id: string; path: string } | null; warning?: string };
