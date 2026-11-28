import { parseWith } from '../lib/schema.js';
import { valueAt } from '../lib/yaml-file.js';
import type { CloudDeploy, CloudDeploys } from './deploys.js';
import { GCLOUD_TIMEOUT_MS, gcloudError, jsonList, warningOf } from './gcloud.js';
import type { CloudDeps } from './gcp.js';
import { GCP_PROJECT } from './gcp-config.js';

// The deploys GCP lists (CONTEXT.md, Cloud Logs, Deploys): Cloud Run's revisions and App Engine's
// versions with their creation times, read with the person's own gcloud as an argv.

type Row = Record<string, unknown>;

/** A source gcloud says this project does not use (no App Engine app, an API off): no deploys, no note. */
const NOT_USED =
  /does not contain an App Engine application|Apps instance .* not found|has not been used in project|SERVICE_DISABLED/i;
/** A Cloud Run region as gcloud names it (`us-central1`), checked before it goes into an argv. */
const REGION = /^[a-z]+(?:-[a-z]+)*\d+$/;

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** gcloud's JSON list in `project`; none when the project does not use the source, a gcloudError otherwise. */
async function listed(deps: CloudDeps, project: string, argv: string[]): Promise<Row[]> {
  const read = await deps.run('gcloud', argv, GCLOUD_TIMEOUT_MS);
  if (read.ok) return jsonList(read.stdout);
  if (read.reason === 'failed' && NOT_USED.test(read.output || read.detail)) return [];
  throw gcloudError(read, project);
}

/**
 * Cloud Run's revisions in `project`: `revisions list` needs a region, so the regions come from
 * `services list` (which reads every region), then each region's revisions.
 */
async function cloudRun(deps: CloudDeps, project: string, from: string): Promise<CloudDeploy[]> {
  const services = await listed(deps, project, [
    'run',
    'services',
    'list',
    `--project=${project}`,
    '--format',
    'json(metadata.labels)',
  ]);
  const regions = new Set(
    services
      .map((s) =>
        text((valueAt(s, 'metadata.labels') as Row | undefined)?.['cloud.googleapis.com/location']),
      )
      .filter((r): r is string => Boolean(r && REGION.test(r))),
  );
  const revisions = await Promise.all(
    [...regions].map((region) =>
      listed(deps, project, [
        'run',
        'revisions',
        'list',
        `--project=${project}`,
        `--region=${region}`,
        '--format',
        'json(metadata.name,metadata.creationTimestamp,metadata.labels)',
        // gcloud filters what it prints: a project keeps thousands of revisions.
        `--filter=metadata.creationTimestamp>="${from}"`,
      ]),
    ),
  );
  return revisions.flat().flatMap((row) => {
    const service = text(
      (valueAt(row, 'metadata.labels') as Row | undefined)?.['serving.knative.dev/service'],
    );
    const revision = text(valueAt(row, 'metadata.name'));
    const at = text(valueAt(row, 'metadata.creationTimestamp'));
    return service && revision && at
      ? [{ project, service, revision, at, source: 'cloud-run' as const }]
      : [];
  });
}

/** App Engine's versions in `project`, each at its creation time (else its last deploy). */
async function appEngine(deps: CloudDeps, project: string, from: string): Promise<CloudDeploy[]> {
  const versions = await listed(deps, project, [
    'app',
    'versions',
    'list',
    `--project=${project}`,
    '--format',
    'json(id,service,version.createTime,last_deployed_time.datetime)',
    `--filter=version.createTime>="${from}"`,
  ]);
  return versions.flatMap((row) => {
    const service = text(row.service);
    const revision = text(row.id);
    const at =
      text(valueAt(row, 'version.createTime')) ?? text(valueAt(row, 'last_deployed_time.datetime'));
    const time = at ? new Date(at) : undefined;
    return service && revision && time && !Number.isNaN(time.getTime())
      ? [{ project, service, revision, at: time.toISOString(), source: 'app-engine' as const }]
      : [];
  });
}

const SOURCES = [
  ['Cloud Run revisions', cloudRun],
  ['App Engine versions', appEngine],
] as const;

/** Every deploy GCP lists in `project` since `from` (an ISO time), with a note for each source that failed. */
export async function listedDeploys(
  deps: CloudDeps,
  project: string,
  from: string,
): Promise<CloudDeploys> {
  // Checked again here, as it goes into an argv: a GCP id, never a flag.
  parseWith(GCP_PROJECT, project, 'project');
  const read = await Promise.all(
    SOURCES.map(async ([what, source]): Promise<CloudDeploys> => {
      try {
        return { deploys: await source(deps, project, from), notes: [] };
      } catch (error) {
        const note = warningOf(project, error);
        return { deploys: [], notes: [{ ...note, message: `${what}: ${note.message}` }] };
      }
    }),
  );
  return { deploys: read.flatMap((r) => r.deploys), notes: read.flatMap((r) => r.notes) };
}
