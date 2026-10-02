import { MesaError } from '../lib/result.js';

const LIMITS = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const;

/** Numeric five-field cron: lists, inclusive ranges and steps, evaluated in local time. */
export function cronFields(expression: string): Set<number>[] {
  const fields = expression.trim().split(/\s+/);
  const invalid = () =>
    new MesaError('invalid_config', 'cron needs five numeric fields with valid ranges and steps');
  if (fields.length !== LIMITS.length) throw invalid();
  return fields.map((field, at) => {
    const [min, max] = LIMITS[at] as (typeof LIMITS)[number];
    const values = new Set<number>();
    for (const part of field.split(',')) {
      const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
      if (!match) throw invalid();
      const range = match[1] ?? '';
      const step = Number(match[2] ?? 1);
      const [start, end] = range === '*' ? [min, max] : range.split('-').map(Number);
      const last = end ?? (match[2] ? max : start);
      if (
        start === undefined ||
        last === undefined ||
        start < min ||
        last > max ||
        start > last ||
        step < 1 ||
        step > max - min + 1
      )
        throw invalid();
      for (let n = start; n <= last; n += step) values.add(at === 4 && n === 7 ? 0 : n);
    }
    return values;
  });
}
