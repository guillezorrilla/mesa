import type { z } from 'zod';
import type { Runner } from '../lib/process.js';
import { type JsonRead, runJson } from '../lib/run-json.js';

/**
 * One `gh api graphql` call. Strings go as `-f`, so a repo named `2048` stays a string and an
 * `@file` value is never read; only integers Mesa produced go as `-F`.
 */
export function ghGraphql<T>(
  run: Runner,
  query: string,
  vars: { strings?: Record<string, string>; ints?: Record<string, number> },
  schema: z.ZodType<T>,
): Promise<JsonRead<T>> {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars.strings ?? {})) args.push('-f', `${k}=${v}`);
  for (const [k, v] of Object.entries(vars.ints ?? {})) args.push('-F', `${k}=${Math.trunc(v)}`);
  return runJson(run, 'gh', args, schema, 30_000);
}

/** `owner/name` as the GraphQL variables both queries take. */
export const repoVars = (repo: string) => {
  const [owner = '', name = ''] = repo.split('/');
  return { owner, name };
};
