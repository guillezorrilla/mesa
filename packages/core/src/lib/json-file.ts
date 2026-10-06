import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { z } from 'zod';
import { writeFileAtomic } from './atomic-file.js';
import { type LockDeps, withFileLock } from './lock-file.js';
import { MesaError } from './result.js';
import { parseWith } from './schema.js';

// JSON state files: read and validated, and changed under `<file>.lock` (ADR-0022). A schema's
// description (`.describe('inbox state')`) names the file in errors.

/** The file's value, validated; undefined when there is no file. */
export function readJson<T>(file: string, schema: z.ZodType<T>): T | undefined {
  if (!existsSync(file)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    const what = schema.description ? ` ${schema.description} is` : '';
    throw new MesaError('invalid_config', `${file}:${what} not valid JSON`);
  }
  return parseWith(schema, raw, file);
}

/**
 * Read-change-write of a JSON state file under `<file>.lock`, so concurrent processes keep each
 * other's changes. `change` gets the current value (undefined when there is no file) and returns
 * the next, which is validated and written atomically only when its text differs; undefined
 * removes the file. A new file is 0600 and an existing one keeps its mode. A held lock is waited
 * for `tries` pauses (withLockSync), then refused as `what` (the schema's description by default).
 */
export function changeJson<T, R extends T | undefined>(
  file: string,
  schema: z.ZodType<T>,
  change: (current: T | undefined) => R,
  lock: LockDeps,
  { tries, what = schema.description }: { tries?: number; what?: string } = {},
): R {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  return withFileLock(
    lock,
    file,
    () => {
      const next = change(readJson(file, schema));
      if (next === undefined) {
        rmSync(file, { force: true });
        return next;
      }
      const valid = parseWith(schema, next, file) as R;
      const text = `${JSON.stringify(valid, null, 2)}\n`;
      const old = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
      if (text !== old)
        writeFileAtomic(file, text, old === undefined ? 0o600 : statSync(file).mode & 0o777);
      return valid;
    },
    what,
    tries,
  );
}
