// Git text recipes (CONTEXT.md, Skill run): what a `git-text` run is asked to write, a profile
// setting a project's mesa.yaml overrides, with each `{name}` core knows filled in.

/** The commit message recipe Mesa ships; `git.commitMessageRecipe` replaces it. */
export const DEFAULT_COMMIT_RECIPE = `Write the git commit message for the staged changes below.

- First line: what the change does, in the imperative, under 72 characters, with no trailing period.
- Then, only when the first line is not enough, a blank line and a short body saying why, wrapped at 72 columns.
- Match the style of the recent commits when they share one.

Branch: {branch}

Recent commits:
{recentCommits}

Staged files:
{stagedFiles}

Staged patch:
{stagedPatch}`;

/** The pull request recipe Mesa ships; `git.pullRequestRecipe` replaces it. */
export const DEFAULT_PULL_REQUEST_RECIPE = `Write the title and body of a pull request for the branch below.

- First line: the title alone, under 72 characters, saying what the change does.
- Then a blank line and the body, for a reviewer who has not seen the branch: what changed and why, in short paragraphs or a list.
- Name each change the commits make, and nothing the patch does not show.

Branch: {branch}, into {base}

Commits:
{commits}

Patch:
{branchPatch}`;

/** Fills each `{name}` in `recipe` that `values` holds; an unknown one stays as written. */
export const fillRecipe = (recipe: string, values: Readonly<Record<string, string>>) =>
  recipe.replace(/\{(\w+)\}/g, (written, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? written) : written,
  );

/** How much of a patch a recipe is given: 200 KB. */
export const PATCH_LIMIT_BYTES = 200_000;

/** `patch` cut to `limit` bytes, at a line end, with a line saying so; whole when it fits. */
export function cutPatch(patch: string, limit = PATCH_LIMIT_BYTES) {
  const bytes = Buffer.byteLength(patch);
  if (bytes <= limit) return patch;
  const head = Buffer.from(patch).subarray(0, limit).toString('utf8');
  const kept = head.slice(0, Math.max(0, head.lastIndexOf('\n') + 1));
  return `${kept}[Mesa cut the patch here: ${bytes - Buffer.byteLength(kept)} more bytes of it are not shown]\n`;
}

/**
 * `text` in a fence marked as data, longer than any backtick run inside it, so nothing in the
 * text can close it early.
 */
export function dataFence(kind: string, text: string) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${kind}\n${text.endsWith('\n') || !text ? text : `${text}\n`}${fence}`;
}
