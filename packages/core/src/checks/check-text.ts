// What a check returns and how it reads (CONTEXT.md, Check), with no Node import, for the app too.

export type CheckResult = {
  ok: boolean;
  project: string;
  command: string;
  folder: string;
  /** The command's exit status; none when it timed out. */
  exitCode?: number;
  timedOut?: true;
  durationMs: number;
  /** The whole output, stdout and stderr together, private to the profile. */
  log: string;
  errors: string[];
  /** How many more error lines the log holds than `errors` shows. */
  more: number;
};

/** A check's result as one line, then its errors when it failed. */
export function checkText(result: CheckResult): string {
  const seconds = Math.round(result.durationMs / 100) / 10;
  if (result.ok) return `check passed: ${result.command} (${seconds} s); log ${result.log}`;
  const how = result.timedOut ? 'timed out' : `exited ${result.exitCode ?? '?'}`;
  return [
    `check failed: ${result.command} ${how} (${seconds} s); log ${result.log}`,
    ...result.errors,
    ...(result.more ? [`(${result.more} more lines in the log)`] : []),
  ].join('\n');
}
