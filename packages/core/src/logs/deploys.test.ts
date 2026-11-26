import { join } from 'node:path';
import { expect, test } from 'vitest';
import { scriptedRunner, tempDir } from '../testing/index.js';
import { listedDeploys } from './deploy-sources.js';
import { cloudDeploys } from './deploys.js';
import type { GcpLogs } from './gcp-config.js';

// Invented projects, services and revisions in the shapes gcloud prints them.
const NOW = new Date('2026-05-06T08:00:00Z');
const CONFIG: GcpLogs = { projects: ['tide-tables-123', 'harbour-web-456'], envs: {} };
const minute = (m: number) => `2026-05-06T07:${String(m).padStart(2, '0')}:00.000000000Z`;

/** A GKE container's entry, as `gcloud logging read --format json` prints it. */
const gke = (id: string, m: number, hash: string, namespace = 'tides') => ({
  insertId: id,
  timestamp: minute(m),
  severity: 'INFO',
  resource: {
    type: 'k8s_container',
    labels: { cluster_name: 'harbour-beta', namespace_name: namespace, container_name: 'tide-api' },
  },
  labels: {
    'k8s-pod/pod-template-hash': hash,
    'logging.gke.io/top_level_controller_name': 'tide-api',
  },
  jsonPayload: { message: 'tide lookup' },
});
/** A Cloud Run entry. */
const run = (id: string, m: number, revision: string) => ({
  insertId: id,
  timestamp: minute(m),
  resource: {
    type: 'cloud_run_revision',
    labels: { service_name: 'harbour-web', revision_name: revision },
  },
  textPayload: 'page served',
});
/** `gcloud run services list --format json(metadata.labels)`'s row. */
const service = (region: string) => ({
  metadata: { labels: { 'cloud.googleapis.com/location': region } },
});
/** `gcloud run revisions list --format json(metadata.name,metadata.creationTimestamp,metadata.labels)`'s row. */
const revision = (name: string, svc: string, at: string) => ({
  metadata: {
    name,
    creationTimestamp: at,
    labels: { 'serving.knative.dev/service': svc, 'cloud.googleapis.com/location': 'us-east4' },
  },
});
/** `gcloud app versions list --format json(id,service,version.createTime,last_deployed_time.datetime)`'s row. */
const version = (id: string, svc: string, at: string) => ({
  id,
  service: svc,
  version: { createTime: at },
  last_deployed_time: { datetime: '2026-05-06 00:15:00-07:00' },
});

type Answer = object[] | string;
/** gcloud answering each project's entries, services, revisions (by region) and versions; a string is a failure. */
function gcloudFor(
  answers: Record<
    string,
    { logs?: Answer; services?: Answer; revisions?: Record<string, Answer>; versions?: Answer }
  >,
) {
  return scriptedRunner({
    gcloud: (args) => {
      const flag = (name: string) =>
        args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? '';
      const answer = answers[flag('project')] ?? {};
      const said =
        args[0] === 'logging'
          ? answer.logs
          : args[0] === 'app'
            ? answer.versions
            : args[1] === 'services'
              ? answer.services
              : answer.revisions?.[flag('region')];
      if (typeof said === 'string')
        return { ok: false, reason: 'failed', detail: 'exit 1', output: said };
      return JSON.stringify(said ?? []);
    },
  });
}

test('deploys come from Cloud Run revisions in each region, App Engine versions and new GKE pod templates, of the services shown in the range, oldest first', async () => {
  const { run: runner, calls } = gcloudFor({
    'tide-tables-123': {
      logs: [gke('t3', 50, 'b2b2c3d4e5'), gke('t2', 20, 'a1a1b2c3d4'), gke('t1', 5, 'a1a1b2c3d4')],
      versions:
        'ERROR: (gcloud.app.versions.list) Apps instance [tide-tables-123] not found: Resource was not found.',
    },
    'harbour-web-456': {
      logs: [run('h2', 45, 'harbour-web-00213-xoz'), run('h1', 10, 'harbour-web-00212-kel')],
      services: [service('us-east4'), service('europe-west1')],
      revisions: {
        'us-east4': [
          revision('harbour-web-00213-xoz', 'harbour-web', '2026-05-06T07:42:00.123456Z'),
          revision('harbour-web-00212-kel', 'harbour-web', '2026-05-05T09:00:00.000000Z'),
        ],
        // A service with no entries shown is left out.
        'europe-west1': [
          revision('lantern-admin-00004-qup', 'lantern-admin', '2026-05-06T07:30:00.000000Z'),
        ],
      },
      versions: [version('20260506t071500', 'harbour-web', '2026-05-06T07:15:00Z')],
    },
  });
  const found = await cloudDeploys({ run: runner, now: () => NOW }, CONFIG, { since: '1h' });
  expect(found.notes).toEqual([]);
  expect(found.deploys).toEqual([
    {
      project: 'harbour-web-456',
      service: 'harbour-web',
      revision: '20260506t071500',
      at: '2026-05-06T07:15:00.000Z',
      source: 'app-engine',
    },
    {
      project: 'harbour-web-456',
      service: 'harbour-web',
      revision: 'harbour-web-00213-xoz',
      at: '2026-05-06T07:42:00.123456Z',
      source: 'cloud-run',
    },
    {
      project: 'tide-tables-123',
      service: 'tide-api',
      revision: 'b2b2c3d4e5',
      at: minute(50),
      source: 'logs',
    },
  ]);
  // Every project goes into an argv as --project=<id>, never as a word that could read as a flag.
  expect(calls.every((c) => c.args.some((a) => /^--project=[\w-]+$/.test(a)))).toBe(true);
  expect(
    calls
      .filter((c) => c.args[1] === 'revisions')
      .map((c) => c.args.find((a) => a.startsWith('--region='))),
  ).toEqual(['--region=us-east4', '--region=europe-west1']);
  // gcloud prints only what the range holds.
  expect(calls.find((c) => c.args[1] === 'revisions')?.args).toContain(
    '--filter=metadata.creationTimestamp>="2026-05-06T07:00:00.000Z"',
  );
});

test('a picked service limits the deploys to it, and a source that fails is a note, never an error', async () => {
  const { run: runner } = gcloudFor({
    'harbour-web-456': {
      services:
        'ERROR: (gcloud.run.services.list) PERMISSION_DENIED: caller lacks run.services.list',
      versions: [
        version('v7', 'harbour-web', '2026-05-06T07:20:00Z'),
        version('v2', 'lantern-admin', '2026-05-06T07:25:00Z'),
      ],
    },
  });
  const found = await cloudDeploys({ run: runner, now: () => NOW }, CONFIG, {
    services: ['harbour-web-456/harbour-web'],
  });
  expect(found.deploys.map((d) => d.revision)).toEqual(['v7']);
  expect(found.notes).toHaveLength(1);
  expect(found.notes[0]).toMatchObject({ project: 'harbour-web-456', action: 'login' });
  expect(found.notes[0]?.message).toMatch(/^Cloud Run revisions: /);
});

test('a project id that could read as a flag never reaches gcloud', async () => {
  const { run: runner, calls } = gcloudFor({});
  await expect(
    listedDeploys(
      { run: runner, now: () => NOW },
      '--impersonate-service-account=x',
      NOW.toISOString(),
    ),
  ).rejects.toThrow(/GCP project id/);
  expect(calls).toEqual([]);
});

test("a range's deploys are reused for two minutes, one when a source failed, kept by its env, projects, services and since", async () => {
  const answers = {
    'harbour-web-456': {
      logs: [run('h1', 10, 'harbour-web-00213-xoz')],
      services: [service('us-east4')],
      revisions: {
        'us-east4': [revision('harbour-web-00213-xoz', 'harbour-web', '2026-05-06T07:42:00Z')],
      },
    },
  };
  const { run: runner, calls } = gcloudFor(answers);
  let now = NOW;
  const deps = { run: runner, now: () => now };
  const lock = { processId: 1, processAlive: () => true, clock: () => now };
  const cache = { file: join(tempDir(), 'cloud-deploys.json'), lock };
  const first = await cloudDeploys(deps, CONFIG, { since: '1h' }, cache);
  const read = calls.length;
  expect(await cloudDeploys(deps, CONFIG, { since: '1h' }, cache)).toEqual(first);
  expect(calls.length).toBe(read);
  await cloudDeploys(deps, CONFIG, { since: '6h' }, cache);
  expect(calls.length).toBeGreaterThan(read);
  const sixHours = calls.length;
  now = new Date(NOW.getTime() + 3 * 60_000);
  await cloudDeploys(deps, CONFIG, { since: '1h' }, cache);
  expect(calls.length).toBeGreaterThan(sixHours);

  // A failing source is asked again only after a minute, so redraws do not re-run gcloud.
  now = NOW;
  const failing = gcloudFor({
    'harbour-web-456': { services: 'ERROR: (gcloud.run.services.list) boom' },
  });
  const noted = { file: join(tempDir(), 'cloud-deploys.json'), lock };
  const deps2 = { run: failing.run, now: () => now };
  expect((await cloudDeploys(deps2, CONFIG, {}, noted)).notes).toHaveLength(1);
  const once = failing.calls.length;
  expect((await cloudDeploys(deps2, CONFIG, {}, noted)).notes).toHaveLength(1);
  expect(failing.calls.length).toBe(once);
  now = new Date(NOW.getTime() + 61_000);
  await cloudDeploys(deps2, CONFIG, {}, noted);
  expect(failing.calls.length).toBe(2 * once);
});
