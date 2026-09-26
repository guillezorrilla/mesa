import type { z } from 'zod';
import { MesaError } from './result.js';

/** Parses `raw` with a schema; failure is invalid_config naming the file and the first failing field. */
export function parseWith<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = issues[0];
  throw new MesaError('invalid_config', `${file}: ${first?.path || '(root)'}: ${first?.message}`, {
    issues,
  });
}
