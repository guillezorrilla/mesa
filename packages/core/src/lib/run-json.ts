import type { z } from 'zod';
import type { Runner } from './process.js';

/** A CLI's JSON answer, checked against `schema`; a failure is a reported reason, never thrown. */
export type JsonRead<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'failed' | 'timeout' | 'invalid-data'; detail?: string };

/** Runs `file args` and hands back its stdout as is; a failure is a reported reason, never thrown. */
export async function runText(
  run: Runner,
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<JsonRead<string>> {
  const res = await run(file, args, timeoutMs);
  if (!res.ok)
    return {
      ok: false,
      reason: res.reason === 'timeout' ? 'timeout' : 'failed',
      detail: res.detail,
    };
  return { ok: true, value: res.stdout };
}

/** Runs `file args`, parses its stdout as JSON and checks it with `schema`. */
export async function runJson<T>(
  run: Runner,
  file: string,
  args: string[],
  schema: z.ZodType<T>,
  timeoutMs: number,
): Promise<JsonRead<T>> {
  const res = await runText(run, file, args, timeoutMs);
  if (!res.ok) return res;
  let raw: unknown;
  try {
    raw = JSON.parse(res.value);
  } catch {
    return { ok: false, reason: 'invalid-data' };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'invalid-data' };
}
