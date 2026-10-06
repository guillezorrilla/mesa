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
  /** `input` is written to its stdin; without it, stdin ends at once. */
  options?: { cwd?: string; env?: Env; input?: string },
) => Promise<RunResult>;

/**
 * The real runner: execFile with a timeout, in `options.env` when a caller passes one, else in
 * `env`. Only an entrypoint builds it, with the environment it runs in (ADR-0008).
 */
export const envRunner =
  (env: Env): Runner =>
  (file, args, timeoutMs, options) =>
    new Promise((resolve) => {
      const child = execFile(
        file,
        args,
        {
          timeout: timeoutMs,
          cwd: options?.cwd,
          env: (options?.env ?? env) as NodeJS.ProcessEnv,
          // ponytail: 64 MiB, not the 1 MiB default, for Git diffs and listings; stream if one outgrows it.
          maxBuffer: 64 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) return resolve({ ok: true, stdout });
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT')
            return resolve({ ok: false, reason: 'missing', detail: error.message });
          if (error.killed) return resolve({ ok: false, reason: 'timeout', detail: error.message });
          resolve({
            ok: false,
            reason: 'failed',
            detail: (stderr || stdout || error.message).trim(),
          });
        },
      );
      // With no input, providers such as codex exec must see EOF immediately.
      // A child that exits without reading its input is no error of the run's (EPIPE).
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(options?.input);
    });

/** One POSIX shell word, single-quoted. */
export const shellWord = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;
