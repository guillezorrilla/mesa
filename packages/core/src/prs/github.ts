import { z } from 'zod';
import { discardGithub, draftGithub } from './github-draft.js';
import { ghGraphql, repoVars } from './github-graphql.js';
import { Nodes, PR_FACTS, PrNode, toPr } from './github-pr.js';
import { showGithub } from './github-show.js';
import type { PrProviderApi, PrReader } from './reader.js';

// One GraphQL call per repo: its open PRs with what the bucket rule needs, and who I am.
// ponytail: 50 PRs per repo; page when a repo outgrows it.
const QUERY = `query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { ...PrFacts }
    }
  }
}
${PR_FACTS}`;

const Response = z.object({
  data: z.object({
    viewer: z.object({ login: z.string() }),
    repository: z.object({ pullRequests: Nodes(PrNode) }),
  }),
});

/** A GitHub repo's open PRs through `gh api graphql`; `repo` is `owner/name`. */
export const readGithub: PrReader = async (run, repo) => {
  const read = await ghGraphql(run, QUERY, { strings: repoVars(repo) }, Response);
  if (!read.ok) return read;
  const { viewer, repository } = read.value.data;
  return {
    ok: true,
    me: viewer.login,
    prs: repository.pullRequests.nodes.map((pr) => toPr(pr, viewer.login)),
  };
};

/** GitHub through `gh api graphql`: reads, and drafts that stay in my pending review (ADR-0024). */
export const githubApi: PrProviderApi = {
  list: readGithub,
  show: showGithub,
  draft: draftGithub,
  discard: discardGithub,
};
