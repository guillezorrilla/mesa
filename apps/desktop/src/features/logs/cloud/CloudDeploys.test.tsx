// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { attached, envelope, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import { CloudLogsScreen } from './CloudLogsScreen';

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const GCP = { projects: ['tide-tables-123'], envs: { beta: 'x' } };
const config = () => {
  const base = (HEALTHY.config as (args: string[]) => { data: object })([]).data;
  return envelope({
    ...base,
    logs: {
      panel: true,
      cloudTab: true,
      views: [],
      prodAsk: [],
      mask: true,
      fixProjects: {},
      recentProjects: [],
      starredProjects: [],
      gcp: GCP,
    },
  });
};
/** An invented entry of tide-api, a Cloud Run service. */
const entry = (id: string, minutesAgo: number, fields: Record<string, string>) => ({
  project: 'tide-tables-123',
  id,
  time: at(minutesAgo),
  severity: 'ERROR',
  service: 'tide-api',
  message: 'tide lookup failed',
  trace: null,
  fields,
});
const DEPLOY = {
  project: 'tide-tables-123',
  service: 'tide-api',
  revision: 'tide-api-00213-xoz',
  at: at(6),
  source: 'cloud-run',
};
const GROUP = {
  project: 'tide-tables-123',
  id: 'TideTableNotFoundException at TableStore.java:41',
  message: 'TideTableNotFoundException at TableStore.java:41',
  sample: 'TideTableNotFoundException: no table for station LC-04',
  count: 12,
  firstSeen: at(4),
  lastSeen: at(1),
  services: ['tide-api'],
  badge: 'new',
  source: 'logs',
  spark: [0, 0, 0, 0, 3, 9],
};

const bridgeFor = () =>
  fakeBridge({
    config,
    'logs asks': () => envelope({ asks: [] }),
    'logs deploys': () => envelope({ deploys: [DEPLOY], notes: [] }),
    'logs errors': () => envelope({ env: 'beta', warnings: [], groups: [GROUP], incidents: [] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({
            env: 'beta',
            services: [{ project: 'tide-tables-123', name: 'tide-api', kind: 'Cloud Run' }],
            warnings: [],
          })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta'],
            filters: {},
            warnings: [],
            entries: [
              entry('a1', 1, { company: 'Lantern Cove', revision: 'tide-api-00213-xoz' }),
              entry('a2', 5, { company: 'Lantern Cove', revision: 'tide-api-00213-xoz' }),
              entry('a3', 10, { company: 'Quiet Reef', revision: 'tide-api-00212-kel' }),
            ],
          }),
  });

test("the Explorer's histogram marks a deploy in its service's colour, and the query bar suggests real field names and their values", async () => {
  const { bridge, calls } = bridgeFor();
  await renderWithMesa(
    <CloudLogsScreen
      mode="explorer"
      filters={{ since: '1h' }}
      onView={() => {}}
      onSession={() => {}}
    />,
    bridge,
  );
  await attached();
  const marker = document.querySelector('[aria-label="Entries over time"] [data-deploy]');
  if (!marker) throw new Error('no deploy marker on the histogram');
  expect(marker.getAttribute('aria-label')).toMatch(/^Deploy tide-api rev 00213, /);
  expect(marker.getAttribute('title')).toContain('tide-api-00213-xoz');
  expect((marker.firstElementChild as HTMLElement).style.backgroundColor).not.toBe('');
  // Deploys are read by the range and services shown, not the query.
  expect(calls.find((argv) => argv[2] === 'deploys')).toEqual(
    expect.arrayContaining(['logs', 'deploys', '--since=1h']),
  );

  const query = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Query"]');
  const suggestions = () =>
    [...document.querySelectorAll('[aria-label="Suggestions"] button')].map((b) => b.textContent);
  await fill(query, 'revision');
  expect(suggestions()).toEqual(['resource.labels.revision_name=']);
  await fill(query, 'resource.labels.revision_name=');
  expect(suggestions()).toEqual([
    'resource.labels.revision_name="tide-api-00213-xoz"',
    'resource.labels.revision_name="tide-api-00212-kel"',
  ]);
  await fill(query, 'comp');
  expect(suggestions()).toEqual(['jsonPayload.company=']);
  await fill(query, 'serv');
  expect(suggestions()).toEqual(['resource.labels.service_name=']);
});

test('an error group that started soon after a deploy of its service says so, in its row and its detail, whose chart marks the deploy', async () => {
  const { bridge } = bridgeFor();
  await renderWithMesa(
    <CloudLogsScreen
      mode="errors"
      filters={{ since: '1h' }}
      onView={() => {}}
      onSession={() => {}}
    />,
    bridge,
  );
  await attached();
  const detail = document.querySelector('[aria-label="Error detail"]');
  expect(detail?.querySelector('[data-deploy]')).not.toBeNull();
  expect(detail?.textContent).toContain('started 2 min after tide-api rev 00213');
  const row = document.querySelector('[aria-label="Error groups"]');
  expect(
    row?.querySelector('[aria-label="started 2 min after tide-api rev 00213"]'),
  ).not.toBeNull();
});
