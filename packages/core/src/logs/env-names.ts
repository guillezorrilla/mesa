// What the Cloud Logs setup names an env and how envs of one name join (CONTEXT.md, Cloud Logs).
// Browser-safe: the app's setup uses it too.

/** The env words a GKE cluster's or Cloud Run service's name can hold, most specific first. */
export const ENV_WORDS = ['prod', 'staging', 'beta', 'dev'] as const;

/** The env a cluster's name suggests: the first env word it holds, else the name itself. */
export const envNameOf = (cluster: string) =>
  ENV_WORDS.find((word) => cluster.toLowerCase().includes(word)) ?? cluster;

/**
 * `rows` as logs.gcp.envs: rows of one name join into one filter that matches any of theirs, and a
 * row without a name or filter is left out.
 */
export function joinEnvs(rows: readonly { name: string; filter: string }[]) {
  const byName = new Map<string, string[]>();
  for (const { name, filter } of rows) {
    if (!name.trim() || !filter.trim()) continue;
    byName.set(name.trim(), [...(byName.get(name.trim()) ?? []), filter.trim()]);
  }
  return Object.fromEntries(
    [...byName].map(([name, filters]) => [
      name,
      filters.length === 1 ? (filters[0] as string) : filters.map((f) => `(${f})`).join(' OR '),
    ]),
  );
}
