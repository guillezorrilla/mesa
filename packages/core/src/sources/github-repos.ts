import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { githubPages } from './github.js';

const installationsSchema = z.object({
  installations: z.array(z.object({ id: z.number(), account: z.object({ login: z.string() }) })),
});
const reposSchema = z.object({
  repositories: z.array(
    z.object({ full_name: z.string(), private: z.boolean().optional(), html_url: z.string() }),
  ),
});

/** A repo the GitHub connection reads. */
export type GithubRepo = { fullName: string; private: boolean; url: string };

/**
 * Every repo the signed-in person can read through Mesa's GitHub App: those of each installation
 * they can reach (an org or account it is installed on, with all or picked repos), by full name.
 * Read live, as installing on a new repo changes it without signing in again.
 */
export async function githubRepos(get: Http): Promise<GithubRepo[]> {
  const installations = await githubPages(
    get,
    '/user/installations',
    installationsSchema,
    (page) => page.installations,
    'GitHub installations',
  );
  const lists = await Promise.all(
    installations.map((installation) =>
      githubPages(
        get,
        `/user/installations/${installation.id}/repositories`,
        reposSchema,
        (page) => page.repositories,
        `GitHub installation ${installation.account.login}`,
      ),
    ),
  );
  const repos = lists.flat().map((r) => ({
    fullName: r.full_name,
    private: r.private ?? false,
    url: r.html_url,
  }));
  return repos
    .filter((r, at) => repos.findIndex((o) => o.fullName === r.fullName) === at)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
