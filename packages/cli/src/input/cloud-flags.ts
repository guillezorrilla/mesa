import { CLOUD_MAX_LIMIT, CLOUD_SEVERITIES, type CloudSeverity, MesaError } from '@mesa/core';
import { wholeNumber } from './flags.js';

/** Repeated `name=value` flags as a record; undefined when none; usage for one without `=`. */
export function pairsOf(values: readonly string[] | undefined, flag: string) {
  if (!values?.length) return undefined;
  const pairs: Record<string, string> = {};
  for (const pair of values) {
    const at = pair.indexOf('=');
    if (at < 1) throw new MesaError('usage', `${flag} must be name=value, not ${pair}`);
    pairs[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return pairs;
}

/** `--severity`, checked to be one of Cloud Logging's. */
function severityFlag(value: string | undefined): CloudSeverity | undefined {
  if (value === undefined) return undefined;
  const lower = value.toLowerCase();
  if (!(CLOUD_SEVERITIES as readonly string[]).includes(lower))
    throw new MesaError(
      'usage',
      `--severity must be one of ${CLOUD_SEVERITIES.join(', ')}, not ${value}`,
    );
  return lower as CloudSeverity;
}

/** The flags that pick entries, shared by `logs gcp` and `logs ask`. */
export const QUERY_FLAGS = {
  env: { type: 'string', description: "One of logs.gcp's envs (default: the first)" },
  service: {
    type: 'string',
    multiple: true,
    description:
      'Only this service, as <project>/<name>: a GKE container, Cloud Run service or App Engine module',
  },
  trace: { type: 'string', description: 'Only entries of this trace id, in any of the projects' },
  field: {
    type: 'string',
    multiple: true,
    description: 'Only entries whose JSON payload field has this value, as key=value',
  },
  filter: { type: 'string', description: 'A Cloud Logging filter of your own, added to the rest' },
  project: {
    type: 'string',
    multiple: true,
    description: 'Only this GCP project of logs.gcp.projects (repeat for more)',
  },
  all: {
    type: 'boolean',
    description: 'Load balancer, proxy, GKE system and audit entries too (left out by default)',
  },
  severity: {
    type: 'string',
    description: `Entries at this severity or worse: ${CLOUD_SEVERITIES.join(', ')}`,
  },
  text: { type: 'string', description: 'Only entries holding this text' },
  since: { type: 'string', description: 'Since an ISO time or an age (30m, 1h, 1d); default 1h' },
  limit: {
    type: 'string',
    description: `The newest N entries, 1 to ${CLOUD_MAX_LIMIT} (default 200)`,
  },
} as const;

/** The query the shared flags give. */
export const queryOf = (flags: {
  env?: string;
  service?: string[];
  trace?: string;
  field?: string[];
  filter?: string;
  project?: string[];
  all?: boolean;
  severity?: string;
  text?: string;
  since?: string;
  limit?: string;
}) => ({
  env: flags.env,
  services: flags.service,
  trace: flags.trace,
  fields: pairsOf(flags.field, '--field'),
  filter: flags.filter,
  projects: flags.project,
  all: flags.all,
  severity: severityFlag(flags.severity),
  text: flags.text,
  since: flags.since,
  limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
});
