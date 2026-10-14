import { join } from 'node:path';
import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';

/** Whether a re-review found an earlier comment of mine dealt with (CONTEXT.md, Comment verdict). */
export const VERDICT_STATES = ['addressed', 'partly', 'not'] as const;

const Verdict = z.strictObject({
  thread: z.string().min(1),
  state: z.enum(VERDICT_STATES),
  note: z.string().optional(),
  /** The review agent's confidence, 0 to 1, kept as Faro keeps its own (AGENTS.md). */
  confidence: z.number().min(0).max(1).optional(),
  round: z.number().int().positive(),
  at: z.string(),
});
export type CommentVerdict = z.infer<typeof Verdict>;

/** A thread's verdict as `mesa prs show` carries it: the stored one, less its thread and time. */
export type ThreadVerdict = Omit<CommentVerdict, 'thread' | 'at'>;

/** `threads`, each with the latest verdict `latest` holds for it, when there is one. */
export function withVerdicts<T extends { id: string }>(
  threads: readonly T[],
  latest: ReadonlyMap<string, CommentVerdict>,
): (T & { verdict?: ThreadVerdict })[] {
  return threads.map((t) => {
    const found = latest.get(t.id);
    if (!found) return t;
    const { thread: _thread, at: _at, ...verdict } = found;
    return { ...t, verdict };
  });
}

const Verdicts = z
  .strictObject({ verdicts: z.array(Verdict).default([]) })
  .describe('PR comment verdicts');

/**
 * The verdicts a PR's review rounds gave my threads, one file per PR under the profile
 * (`prs/<project>/<number>.json`), never in the repository. A later verdict on a thread wins.
 */
export function prVerdicts(dir: string, lock: LockDeps) {
  const file = (project: string, number: number) => join(dir, project, `${number}.json`);
  return {
    record: (project: string, number: number, verdict: CommentVerdict) =>
      changeJson(
        file(project, number),
        Verdicts,
        (current) => ({ verdicts: [...(current?.verdicts ?? []), verdict] }),
        lock,
      ),
    /** Each thread's latest verdict. */
    latest: (project: string, number: number): Map<string, CommentVerdict> =>
      new Map(
        (readJson(file(project, number), Verdicts)?.verdicts ?? []).map((v) => [v.thread, v]),
      ),
  };
}
