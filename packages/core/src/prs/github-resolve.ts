import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import { ghGraphql } from './github-graphql.js';

const RESOLVE = `mutation($thread: ID!) {
  resolveReviewThread(input: {threadId: $thread}) { thread { id isResolved } }
}`;
const UNRESOLVE = `mutation($thread: ID!) {
  unresolveReviewThread(input: {threadId: $thread}) { thread { id isResolved } }
}`;

const Thread = z.object({ thread: z.object({ id: z.string(), isResolved: z.boolean() }) });
const Response = z.object({
  data: z.union([
    z.object({ resolveReviewThread: Thread }).transform((d) => d.resolveReviewThread),
    z.object({ unresolveReviewThread: Thread }).transform((d) => d.unresolveReviewThread),
  ]),
});

/** Marks a review thread resolved, or open again, through one `gh api graphql` mutation. */
export async function resolveGithub(run: Runner, thread: string, resolved: boolean) {
  const read = await ghGraphql(
    run,
    resolved ? RESOLVE : UNRESOLVE,
    { strings: { thread } },
    Response,
  );
  return read.ok
    ? {
        ok: true as const,
        value: { thread: read.value.data.thread.id, resolved: read.value.data.thread.isResolved },
      }
    : read;
}
