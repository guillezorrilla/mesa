/**
 * One mesa command as `mesa help --agent --json` prints it: what agents and the Help screen read.
 * The CLI builds it (`packages/cli/src/help/reference.ts`), since the command table is the CLI's own
 * (ADR-0008); core holds only the shape, so the app can render it. Help has no core function.
 */
export type CommandReference = {
  name: string;
  /** Every argument and flag: `<x>` is required, `[x]` optional, a string flag shows `<string>`. */
  usage: string;
  description: string;
  args: { name: string; required: boolean }[];
  flags: { name: string; type: 'string' | 'boolean'; required: boolean; description: string }[];
  example: string;
};
