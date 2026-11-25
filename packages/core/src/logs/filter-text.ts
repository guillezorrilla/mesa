// The Logging query language's pieces Cloud Logs writes (CONTEXT.md, Cloud Logs): quoted values and
// the label paths a service is named by. Pure, so the app writes its clauses with the same rules.

/** `value` inside a Logging filter's double quotes. */
export const quoted = (value: string) =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** Each kind of resource's service label, its resource type and the kind's name. */
export const SERVICE_LABELS = [
  ['resource.labels.container_name', 'k8s_container', 'GKE'],
  ['resource.labels.service_name', 'cloud_run_revision', 'Cloud Run'],
  ['resource.labels.module_id', 'gae_app', 'App Engine'],
] as const;

/** The label paths an entry's service is read from: logs.gcp.service when set, else each kind's. */
export const servicePaths = (config: { service?: string }) =>
  config.service ? [config.service] : SERVICE_LABELS.map(([path]) => path);

/** The clause matching service `name` under any of `paths` (servicePaths). */
export const serviceClause = (name: string, paths: readonly string[]) =>
  paths.length === 1
    ? `${paths[0]}=${quoted(name)}`
    : `(${paths.map((path) => `${path}=${quoted(name)}`).join(' OR ')})`;
