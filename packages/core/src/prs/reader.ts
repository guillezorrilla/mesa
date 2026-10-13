import type { Runner } from '../lib/process.js';
import type { PrFacts } from './buckets.js';

/** What a list row names about a PR, besides its bucket. */
export type PrHead = {
  number: number;
  title: string;
  url: string;
  branch: string;
  updatedAt: string;
};

/** A repo's open PRs as one provider reports them, and who "me" is there. */
export type RepoRead =
  | { ok: true; me: string; prs: (PrHead & PrFacts)[] }
  | { ok: false; reason: 'failed' | 'timeout' | 'invalid-data'; detail?: string };

/** Reads a repo's open PRs through its provider's CLI (gh, twg): the seam each provider fills. */
export type PrReader = (run: Runner, repo: string) => Promise<RepoRead>;
