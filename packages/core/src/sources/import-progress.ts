import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../lib/atomic-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';

/** Where a running import is: fetching its items one by one, then the Write notes run. */
export type ImportStep = { phase: 'fetching' | 'notes'; done: number; total: number };

const ProgressSchema = z.strictObject({
  pid: z.number().int(),
  startedAt: z.string(),
  phase: z.enum(['fetching', 'notes']),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
/** A project's running import, as `mesa import status` shows it. */
export type ImportProgress = Omit<z.infer<typeof ProgressSchema>, 'pid'>;

/**
 * A project's running import (CONTEXT.md, Import progress): one file per project under `dir`,
 * written as it moves and removed when it ends. One whose process is gone is not running.
 */
export function importProgress(dir: string, deps: LockDeps) {
  const file = (project: string) => join(dir, `${project}.json`);
  const write = (project: string, step: ImportStep, startedAt: string) => {
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(
      file(project),
      JSON.stringify({ pid: deps.processId, startedAt, ...step }),
      0o600,
    );
  };
  const read = (project: string): ImportProgress | null => {
    if (!existsSync(file(project))) return null;
    const parsed = ProgressSchema.safeParse(
      (() => {
        try {
          return JSON.parse(readFileSync(file(project), 'utf8'));
        } catch {
          return null;
        }
      })(),
    );
    if (parsed.success && deps.processAlive(parsed.data.pid)) {
      const { pid: _, ...progress } = parsed.data;
      return progress;
    }
    rmSync(file(project), { force: true });
    return null;
  };
  return {
    read,
    /**
     * Runs `work` as `project`'s import, reporting each step through the function it gets; refused
     * while another import into it runs.
     */
    // ponytail: check-then-write, so two imports started in the same instant may both run.
    track: async <T>(project: string, work: (step: (s: ImportStep) => void) => Promise<T>) => {
      if (read(project)) {
        throw new MesaError(
          'locked',
          `an import into ${project} is running; wait for it (mesa import status --project ${project})`,
        );
      }
      const startedAt = deps.clock().toISOString();
      const step = (s: ImportStep) => write(project, s, startedAt);
      step({ phase: 'fetching', done: 0, total: 0 });
      try {
        return await work(step);
      } finally {
        rmSync(file(project), { force: true });
      }
    },
  };
}
