import { MesaError } from '../lib/result.js';
import type { JsonRead } from '../lib/run-json.js';

/** Why a CLI read failed, naming the CLI. */
export const failure = (cli: string, read: { reason: string; detail?: string }) =>
  `${cli} ${read.reason}${read.detail ? `: ${read.detail}` : ''}`;

/** A CLI read's value, or its failure as an error naming the CLI and where to fix it. */
export function unwrap<T>(cli: string, read: JsonRead<T>): T {
  if (read.ok) return read.value;
  throw new MesaError('internal', `${failure(cli, read)}; see mesa prs setup`);
}
