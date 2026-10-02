import type { z } from 'zod';
import { MesaError } from './result.js';

/** HTTP requests, fetch-shaped: the real fetch in the entrypoints, a fake that answers from a table in tests. */
export type Http = (url: string, init?: RequestInit) => Promise<Response>;

/** A 2xx response's JSON body, parsed by `schema`; any other status or shape is a MesaError naming `what`. */
export async function readJson<T>(response: Response, schema: z.ZodType<T>, what: string) {
  if (!response.ok) throw new MesaError('internal', `${what} answered HTTP ${response.status}`);
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new MesaError('internal', `${what} answered an unexpected body`);
  return parsed.data;
}
