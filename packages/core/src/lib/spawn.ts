import { spawn } from 'node:child_process';
import type { Env } from './process.js';

/** How a process ended; `code` is none when it never started or was killed. */
export type SpawnExit = { code: number | undefined; detail?: string };

/** A running child process, read line by line; the streaming sibling of `Runner`. */
export interface SpawnedProcess {
  /** Writes `text` to the process's stdin. */
  write(text: string): void;
  /** Called with each chunk of stdout, which may end mid-line. */
  onStdout(listener: (chunk: string) => void): void;
  /** Called once when the process ends. */
  onExit(listener: (exit: SpawnExit) => void): void;
  kill(): void;
}

/** Starts a long-lived binary and never throws; a missing binary shows as an exit. */
export type Spawner = (
  file: string,
  args: string[],
  options: { cwd?: string; env?: Env },
) => SpawnedProcess;

/** The real spawner, in `options.env` when a caller passes one, else in `env` (ADR-0008). */
export const envSpawner =
  (env: Env): Spawner =>
  (file, args, options) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: (options.env ?? env) as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    child.stdin.on('error', () => undefined); // a child that exited is no error of the write's
    child.stdout.setEncoding('utf8');
    return {
      write: (text) => void child.stdin.write(text),
      onStdout: (listener) => void child.stdout.on('data', listener),
      onExit: (listener) => {
        // 'error' (ENOENT) fires with no 'close', so one of them ends the process, once.
        let done = false;
        const end = (exit: SpawnExit) => {
          if (!done) {
            done = true;
            listener(exit);
          }
        };
        child.on('error', (error) => end({ code: undefined, detail: error.message }));
        child.on('close', (code) => end({ code: code ?? undefined }));
      },
      kill: () => void child.kill(),
    };
  };
