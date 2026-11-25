import { eachProject, gcloud, jsonList } from './gcloud.js';
import {
  CLOUD_MAX_LIMIT,
  type CloudDeps,
  cloudFilter,
  SERVICE_LABELS,
  servicePaths,
} from './gcp.js';
import type { GcpLogs } from './gcp-config.js';

// The services the Logs tab's picker offers (CONTEXT.md, Cloud Logs): what each GCP project's
// entries of the last hour name, merged with what its resources list, so a service that logs
// rarely is offered too.

/** A service the picker offers: its GCP project, the kind of resource that logged it, its name. */
export type CloudService = { project: string; name: string; kind: string | null };

/**
 * gcloud's listings of each kind's services, as an argv after `gcloud` and the field naming one:
 * GKE workloads (through Cloud Asset), Cloud Run services and App Engine services.
 */
const LISTINGS = [
  [
    'GKE',
    (p: string) => [
      'asset',
      'search-all-resources',
      `--scope=projects/${p}`,
      '--asset-types=apps.k8s.io/Deployment',
      '--format',
      'json(displayName)',
    ],
    'displayName',
  ],
  [
    'Cloud Run',
    (p: string) => ['run', 'services', 'list', '--project', p, '--format', 'json(metadata.name)'],
    'metadata',
  ],
  [
    'App Engine',
    (p: string) => ['app', 'services', 'list', '--project', p, '--format', 'json(id)'],
    'id',
  ],
] as const;

/** What `project`'s resources list as services; each listing that fails (an API off, no role) gives none. */
async function listed(deps: CloudDeps, project: string): Promise<CloudService[]> {
  const lists = await Promise.all(
    LISTINGS.map(async ([kind, argv, field]) => {
      const rows = await gcloud(deps.run, project, argv(project))
        .then(jsonList)
        .catch(() => []);
      return rows.flatMap((row) => {
        const value = row[field];
        const name =
          typeof value === 'string' ? value : (value as { name?: unknown } | undefined)?.name;
        return typeof name === 'string' && name ? [{ project, name, kind }] : [];
      });
    }),
  );
  return lists.flat();
}

/** What `project`'s entries of the last hour name, with the kind of resource that logged each. */
async function logged(deps: CloudDeps, config: GcpLogs, project: string, filter: string) {
  // The label paths are checked by GcpLogsSchema or fixed in gcp.ts, so they are safe here.
  const out = await gcloud(deps.run, project, [
    'logging',
    'read',
    filter,
    '--project',
    project,
    '--format',
    `value(resource.type,${servicePaths(config).join(',')})`,
    '--limit',
    String(CLOUD_MAX_LIMIT),
  ]);
  return out.split('\n').flatMap((line): CloudService[] => {
    const [type = '', ...values] = line.split('\t');
    const name = values.map((value) => value.trim()).find(Boolean);
    const kind = SERVICE_LABELS.find(([, resource]) => resource === type)?.[2] ?? null;
    return name ? [{ project, name, kind: config.service ? null : kind }] : [];
  });
}

/**
 * Every project's services: those its entries of the last hour in `env` name, and those its
 * resources list (unless logs.gcp.service names another label), one each, by project and name.
 */
export async function cloudServices(deps: CloudDeps, config: GcpLogs, env?: string) {
  const filter = cloudFilter(config, { env, since: '1h' }, deps.now());
  const { done, warnings } = await eachProject(config.projects, async (project) => {
    const [fromLogs, fromResources] = await Promise.all([
      logged(deps, config, project, filter),
      config.service ? [] : listed(deps, project),
    ]);
    const found = new Map<string, CloudService>();
    for (const service of [...fromLogs, ...fromResources])
      if (!found.has(service.name)) found.set(service.name, service);
    return [...found.values()];
  });
  const services = done
    .flatMap((read) => read.value)
    .sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name));
  return { services, warnings };
}
