import { expect, test } from 'vitest';
import type { CloudLogEntry } from './gcp.js';
import { queryFields } from './query-fields.js';

const entry = (
  service: string | null,
  severity: string,
  fields: Record<string, string>,
): CloudLogEntry => ({
  project: 'tide-tables-123',
  id: Math.random().toString(36),
  time: '2026-05-06T07:00:00Z',
  severity,
  service,
  message: 'tide lookup',
  trace: null,
  fields,
});
const KINDS: Record<string, string> = {
  'tide-tables-123/tide-api': 'GKE',
  'tide-tables-123/harbour-web': 'Cloud Run',
};

test('the query bar suggests the real field names, each with its values the most common first', () => {
  const fields = queryFields(
    [
      entry('tide-api', 'ERROR', { port: 'lantern-cove', revision: 'a1a1' }),
      entry('tide-api', 'INFO', { port: 'lantern-cove' }),
      entry('harbour-web', 'INFO', { port: 'gull-point', revision: 'harbour-web-00213-xoz' }),
      // A service of unknown kind is not named under a label it may not have.
      entry('lantern-admin', 'INFO', { revision: 'v7' }),
    ],
    (ref) => KINDS[ref],
  );
  expect(fields).toEqual([
    { field: 'severity', values: ['INFO', 'ERROR'] },
    { field: 'jsonPayload.port', values: ['lantern-cove', 'gull-point'] },
    { field: 'resource.labels.container_name', values: ['tide-api'] },
    { field: 'labels."k8s-pod/pod-template-hash"', values: ['a1a1'] },
    { field: 'resource.labels.service_name', values: ['harbour-web'] },
    { field: 'resource.labels.revision_name', values: ['harbour-web-00213-xoz'] },
  ]);
});

test('a configured service label names every service, whatever its kind', () => {
  const fields = queryFields([entry('tide-api', 'INFO', {})], () => undefined, {
    service: 'labels.app',
  });
  expect(fields.map((f) => f.field)).toEqual(['severity', 'labels.app']);
});
