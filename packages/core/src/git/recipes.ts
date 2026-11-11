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

/**
 * How much of a patch a recipe is given: 60 KB, the shape of each change for a commit message or
 * pull request text, not every line of it (docs/spikes/token-usage.md).
 */
export const PATCH_LIMIT_BYTES = 60_000;

const bytes = (text: string) => Buffer.byteLength(text);

/** Up to `limit` bytes of `text`, ending at a line end: never a partial line or character. */
const headLines = (text: string, limit: number) => {
  const head = Buffer.from(text).subarray(0, limit).toString('utf8');
  return head.slice(0, head.lastIndexOf('\n') + 1);
};

/**
 * Each of `sizes` given a fair part of `budget` (max-min): one within an equal share keeps all of
 * it, and what a short one leaves goes to the longer ones, which each get the same.
 */
function fairShares(sizes: readonly number[], budget: number): number[] {
  const shares = new Array<number>(sizes.length).fill(0);
  let left = budget;
  const order = sizes.map((_, i) => i).sort((a, b) => (sizes[a] ?? 0) - (sizes[b] ?? 0));
  order.forEach((i, n) => {
    const share = Math.min(sizes[i] ?? 0, Math.floor(left / (order.length - n)));
    shares[i] = share;
    left -= share;
  });
  return shares;
}

/**
 * `patch` within `limit` bytes, split fairly by file (each `diff --git` block), so one large or
 * generated file cannot crowd out the rest: each file keeps its header (up to its first hunk) and
 * a fair share of the bytes left for hunks, cut at a line end with a line saying how much is not
 * shown. When the headers alone do not fit, the first files keep their headers and one line says
 * how many files were left out. A patch that fits comes back as it is; only the lines Mesa adds
 * go past the limit.
 */
export function cutPatch(patch: string, limit = PATCH_LIMIT_BYTES) {
  if (bytes(patch) <= limit) return patch;
  const files = patch.split(/(?=^diff --git )/m).map((file) => {
    const hunk = file.search(/^@@/m);
    return hunk < 0
      ? { header: file, body: '' }
      : { header: file.slice(0, hunk), body: file.slice(hunk) };
  });
  const cut = (body: string, kept: string) =>
    kept === body
      ? kept
      : `${kept}[Mesa cut this file here: ${bytes(body) - bytes(kept)} more bytes of it are not shown]\n`;
  const headers = files.reduce((sum, file) => sum + bytes(file.header), 0);
  if (headers > limit) {
    let used = 0;
    const kept = files.filter((file) => {
      used += bytes(file.header);
      return used <= limit;
    });
    const out = kept.map((file) => file.header + cut(file.body, ''));
    return `${out.join('')}[Mesa left out ${files.length - kept.length} more files: the patch is over its ${limit}-byte limit]\n`;
  }
  const shares = fairShares(
    files.map((file) => bytes(file.body)),
    limit - headers,
  );
  return files
    .map((file, i) => file.header + cut(file.body, headLines(file.body, shares[i] ?? 0)))
    .join('');
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
