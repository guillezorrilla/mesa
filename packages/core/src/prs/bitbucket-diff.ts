import { z } from 'zod';
import { twg } from './bitbucket-pr.js';
import type { PrProviderApi } from './reader.js';

// `twg ... --output json` wraps the raw unified diff in `content`.
const Diff = z.object({ content: z.string() });

/** One Bitbucket PR's patch through `twg bitbucket pull-requests diff`. */
export const diffBitbucket: PrProviderApi['diff'] = async (run, repo, number) => {
  const read = await twg(
    run,
    ['bitbucket', 'pull-requests', 'diff', String(Math.trunc(number)), '--repo', repo],
    Diff,
  );
  return read.ok ? { ok: true, value: read.value.content } : read;
};
