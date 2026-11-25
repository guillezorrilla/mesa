import { MesaError } from '../lib/result.js';

// `--since` for a log read (CONTEXT.md, Logs panel): an ISO time, or an age counted back from now.

const AGE = /^(\d+)(s|m|h|d)$/;
const SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };

/** `since` as an ISO time: an age is counted back from now; usage when it is neither. */
export function sinceTime(since: string, now: Date) {
  const age = AGE.exec(since);
  if (age)
    return new Date(
      now.getTime() - Number(age[1]) * SECONDS[age[2] as keyof typeof SECONDS] * 1000,
    ).toISOString();
  const at = Date.parse(since);
  if (Number.isNaN(at))
    throw new MesaError('usage', `--since must be an ISO time or an age such as 10m, not ${since}`);
  return new Date(at).toISOString();
}
