import { execFile } from 'node:child_process';

/** Environment variables, passed in rather than read from `process.env`. */
export type Env = Readonly<Record<string, string | undefined>>;

export type RunResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: 'missing' | 'timeout' | 'failed'; detail: string };

/** Runs a binary with a timeout and never throws. The seam for tmux, the agents, and probes. */
export type Runner = (file: string, args: string[], timeoutMs: number) => Promise<RunResult>;

export const execRunner: Runner = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, stdout });
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT')
        return resolve({ ok: false, reason: 'missing', detail: error.message });
      if (error.killed) return resolve({ ok: false, reason: 'timeout', detail: error.message });
      resolve({ ok: false, reason: 'failed', detail: (stderr || error.message).trim() });
    });
  });

/** One POSIX shell word, single-quoted. */
export const shellWord = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;
