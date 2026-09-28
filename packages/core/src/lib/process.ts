import { execFile } from 'node:child_process';

/** Environment variables, passed in rather than read from `process.env`. */
export type Env = Readonly<Record<string, string | undefined>>;

export type RunResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: 'missing' | 'timeout' | 'failed'; detail: string };

/** Runs a binary with a timeout and never throws. The seam for tmux, the agents, and probes. */
export type Runner = (
  file: string,
  args: string[],
  timeoutMs: number,
  options?: { cwd?: string },
) => Promise<RunResult>;

export const execRunner: Runner = (file, args, timeoutMs, options) =>
  new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { timeout: timeoutMs, cwd: options?.cwd },
      (error, stdout, stderr) => {
        if (!error) return resolve({ ok: true, stdout });
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT')
          return resolve({ ok: false, reason: 'missing', detail: error.message });
        if (error.killed) return resolve({ ok: false, reason: 'timeout', detail: error.message });
        resolve({ ok: false, reason: 'failed', detail: (stderr || error.message).trim() });
      },
    );
    // Runner has no stdin input: providers such as codex exec must see EOF immediately.
    child.stdin?.end();
  });

/** One POSIX shell word, single-quoted. */
export const shellWord = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;
