import type { Runner } from '../lib/process.js';
import type { JsonRead } from '../lib/run-json.js';
import type { PrFacts } from './buckets.js';

/** What a list row names about a PR, besides its bucket. */
export type PrHead = {
  number: number;
  title: string;
  url: string;
  branch: string;
  updatedAt: string;
  /** The author as people read them (a GitHub login, a Bitbucket display name); `author` is the id. */
  authorName: string;
};

/** A repo's open PRs as one provider reports them, and who "me" is there. */
export type RepoRead =
  | { ok: true; me: string; prs: (PrHead & PrFacts)[] }
  | { ok: false; reason: 'failed' | 'timeout' | 'invalid-data'; detail?: string };

/** Reads a repo's open PRs through its provider's CLI (gh, twg): the seam each provider fills. */
export type PrReader = (run: Runner, repo: string) => Promise<RepoRead>;

/** An inline thread on a PR: who opened it (an id, as in PrFacts), where, and its last reply. */
export type PrThread = {
  id: string;
  author: string;
  path: string;
  line: number | null;
  body: string;
  resolved: boolean;
  /** The newest comment after the first, if any. */
  lastReply?: { author: string; body: string };
};

/** A Pending draft (CONTEXT.md): mine, on the provider, seen by no one else. No path is a summary. */
export type PrDraft = {
  id: string;
  path: string | null;
  line: number | null;
  body: string;
  /** The thread it answers, when it is a reply. */
  replyTo?: string;
};

export type PrFile = { path: string; additions: number; deletions: number };

/** One PR read in full for its detail: the list's facts plus threads, my drafts and files. */
export type PrRead = {
  me: string;
  pr: PrHead & PrFacts;
  base: string;
  /** The ref on origin a review fetches its head from: GitHub's pull/<n>/head, Bitbucket's source branch. */
  headRef: string;
  additions: number;
  deletions: number;
  /** The head commit's checks rolled up; null when it has none. */
  checks: 'passing' | 'failing' | 'pending' | null;
  threads: PrThread[];
  drafts: PrDraft[];
  files: PrFile[];
};

/** A draft to leave: inline with `path` and `line`, a reply with `replyTo`, else the summary. */
export type DraftInput = { text: string; path?: string; line?: number; replyTo?: string };

/**
 * One provider through its CLI. Every write but `publish` is a Pending draft. `publish` posts my
 * drafts on one PR, only as comments: never an approval or a change request (ADR-0024).
 */
export type PrProviderApi = {
  list: PrReader;
  show: (run: Runner, repo: string, number: number) => Promise<JsonRead<PrRead>>;
  /** The PR's unified diff, base to head, as one patch; read apart from `show`, only when asked. */
  diff: (run: Runner, repo: string, number: number) => Promise<JsonRead<string>>;
  draft: (
    run: Runner,
    repo: string,
    number: number,
    input: DraftInput,
  ) => Promise<JsonRead<PrDraft>>;
  discard: (
    run: Runner,
    repo: string,
    number: number,
    id: string,
  ) => Promise<JsonRead<{ id: string }>>;
  /** Posts my pending drafts on the PR; how many, 0 when there were none. */
  publish: (run: Runner, repo: string, number: number) => Promise<JsonRead<{ published: number }>>;
};
