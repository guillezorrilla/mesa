import { z } from 'zod';

// Cloud Logs' settings in the profile's config.yaml (CONTEXT.md, Cloud Logs): the GCP project and
// its envs, and the saved views. Only zod here, so the profile config can import it.

/** Cloud Logging's severities, least severe first, as `--severity` takes them. */
export const CLOUD_SEVERITIES = [
  'default',
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency',
] as const;
export type CloudSeverity = (typeof CLOUD_SEVERITIES)[number];

/** The env whose first Ask, per GCP project, asks a person first: its entries go to the model. */
export const PROD_ENV = 'prod';
/** A filter that names prod (a cluster, namespace or service: prod, prod-1, prod_api, production) reads prod entries. */
export const PROD_WORD = /(^|[^a-z0-9])prod(uction)?($|[^a-z])/i;
/** What that person confirms. */
export const PROD_ASK = 'Entries Ask reads are sent to the model';
/** The Cloud Logs settings only a person changes: the projects read, masking, the prod confirmation. */
/** The env value that reads every env: no env filter (`--env '*'`, the toolbar's All envs). */
export const ALL_ENVS = '*';

export const PERSON_ONLY_LOGS = ['gcp', 'mask', 'prodAsk'] as const;
/** Why an agent in a Mesa window cannot change them, as for a project's scripts (ADR-0013). */
export const CLOUD_LOGS_FROM_SESSION =
  "Cloud Logs' projects, masking and prod confirmation can only be changed from the Mesa app or a terminal outside a Mesa session";

const ENV_NAME = /^[A-Za-z0-9][\w-]*$/;

// Legacy and domain-scoped ids (`example.com:my-project`) are project ids too: only what could
// reach a shell or a filter as more than a word is refused.
export const GCP_PROJECT = z
  .string()
  .regex(/^[A-Za-z0-9][\w.:-]{0,127}$/, 'must be a GCP project id');

/**
 * `filter`, checked to be one Logging expression: its quotes closed and its parentheses balanced
 * outside them, so wrapped as `(filter)` it cannot close the group and escape the env, noise or
 * time bounds beside it. Undefined when it is; the reason when not.
 */
export function filterProblem(filter: string): string | undefined {
  let depth = 0;
  let quote = false;
  for (let i = 0; i < filter.length; i++) {
    const c = filter[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === '"') quote = false;
    } else if (c === '"') quote = true;
    else if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return 'closes a parenthesis it did not open';
  }
  if (quote) return 'leaves a quote open';
  if (depth) return 'leaves a parenthesis open';
  return undefined;
}

/** A Logging filter, checked by filterProblem. */
const LoggingFilter = z
  .string()
  .trim()
  .min(1, 'must be a Logging filter')
  .superRefine((filter, ctx) => {
    const problem = filterProblem(filter);
    if (problem)
      ctx.addIssue({ code: 'custom', message: `must be one Logging filter: it ${problem}` });
  });

/** A service across projects, as a view and `--service` name it: `<project>/<name>`. */
export const CloudServiceRef = z.string().regex(/^[^/\s]+\/[^/\s].*$/, 'must be <project>/<name>');

/**
 * `logs.gcp`: the GCP projects read together, optional envs as Logging filters applied in every
 * one, and a service label path.
 */
export const GcpLogsSchema = z.strictObject({
  projects: z.array(GCP_PROJECT).min(1, 'must name at least one GCP project'),
  envs: z
    .record(z.string().regex(ENV_NAME, 'must be a name: letters, digits, - and _'), LoggingFilter)
    .default({}),
  /** One label path for every entry's service; unset reads GKE, Cloud Run and App Engine's own. */
  service: z
    .string()
    .regex(
      /^[A-Za-z_]\w*(\.[\w-]+)*$/,
      'must be a label path such as resource.labels.container_name',
    )
    .optional(),
});
export type GcpLogs = z.infer<typeof GcpLogsSchema>;

/**
 * A saved view (`logs.views`): a name and what it picks: env, services, severity, text, facet
 * fields, a Logging filter of its own and the projects it reads; `metric`, the log-based metric
 * it came from, whose counts Cloud Monitoring gives.
 */
export const CloudViewSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  env: z.string().regex(ENV_NAME).optional(),
  services: z.array(CloudServiceRef).optional(),
  severity: z.enum(CLOUD_SEVERITIES).optional(),
  text: z.string().min(1).optional(),
  fields: z.record(z.string(), z.string()).optional(),
  filter: LoggingFilter.optional(),
  projects: z.array(GCP_PROJECT).optional(),
  metric: z.string().min(1).optional(),
});
export type CloudView = z.infer<typeof CloudViewSchema>;
