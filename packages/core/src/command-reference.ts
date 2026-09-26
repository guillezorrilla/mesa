/** One mesa command as `mesa help --agent --json` prints it: what agents and the Help screen read. */
export type CommandReference = {
  name: string;
  /** Every argument and flag: `<x>` is required, `[x]` optional, a string flag shows `<string>`. */
  usage: string;
  description: string;
  args: { name: string; required: boolean }[];
  flags: { name: string; type: 'string' | 'boolean'; required: boolean; description: string }[];
  example: string;
};
