import { join } from 'node:path';
import { expect, test } from 'vitest';
import { scriptedRunner, tempDir } from '../testing/index.js';
import { cloudDeploys, entryDeploys } from './deploys.js';
import type { CloudLogEntry } from './gcp.js';
import type { GcpLogs } from './gcp-config.js';

const NOW = new Date('2026-05-06T08:00:00Z');
const CONFIG: GcpLogs = { projects: ['tide-tables-123', 'harbour-web-456'], envs: {} };

/** An invented entry as gcloud prints it: a GKE pod or a Cloud Run revision. */
const gke = (id: string, minute: number, hash: string) => ({
  insertId: id,
  timestamp: `2026-05-06T07:${String(minute).padStart(2, '0')}:00Z`,
  resource: { type: 'k8s_container', labels: { container_name: 'tide-api' } },
  labels: { 'k8s-pod/pod-template-hash': hash },
  textPayload: 'tide lookup',
});
const run = (id: string, minute: number, revision: string) => ({
  insertId: id,
  timestamp: `2026-05-06T07:${String(minute).padStart(2, '0')}:00Z`,
  resource: {
    type: 'cloud_run_revision',
    labels: { service_name: 'harbour-web', revision_name: revision },
  },
  textPayload: 'page served',
});
const revision = (service: string, name: string, at: string) => ({
  metadata: {
    name,
    creationTimestamp: at,
    labels: { 'serving.knative.dev/service': service },
  },
});

/** gcloud answering each project's entries, revisions and versions; a function's answer is a failure. */
function gcloudFor(
  answers: Record<string, { logs?: object[]; run?: object[] | string; app?: object[] | string }>,
) {
  return scriptedRunner({
    gcloud: (args) => {
      const project = args[args.indexOf('--project') + 1] as string;
      const answer = answers[project] ?? {};
      const said =
        args[0] === 'logging' ? (answer.logs ?? []) : args[0] === 'run' ? answer.run : answer.app;
      if (typeof said === 'string')
        return { ok: false, reason: 'failed', detail: 'exit 1', output: said };
      return JSON.stringify(said ?? []);
    },
  });
}

test("a GKE service's deploy is the first entry of a pod template hash after the first it logged", () => {
  const entries = [
    gke('c', 30, 'b2b2'),
    gke('b', 20, 'a1a1'),
    gke('a', 10, 'a1a1'),
    gke('d', 40, 'a1a1'),
  ].map(
    (raw) =>
      ({
        project: 'tide-tables-123',
        id: raw.insertId,
        time: raw.timestamp,
        severity: 'INFO',
        service: 'tide-api',
        message: raw.textPayload,
        trace: null,
        fields: { revision: raw.labels['k8s-pod/pod-template-hash'] },
      }) satisfies CloudLogEntry,
  );
  expect(entryDeploys(entries)).toEqual([
    {
      project: 'tide-tables-123',
      service: 'tide-api',
      revision: 'b2b2',
      at: '2026-05-06T07:30:00Z',
      source: 'logs',
    },
  ]);
  expect(entryDeploys(entries, () => true)).toEqual([]);
});

test('deploys come from Cloud Run revisions, App Engine versions and new GKE pod templates, of the services shown in the range, oldest first', async () => {
  const { run: runner, calls } = gcloudFor({
    'tide-tables-123': {
      logs: [gke('t3', 50, 'b2b2'), gke('t2', 20, 'a1a1'), gke('t1', 5, 'a1a1')],
      run: [],
      app: 'ERROR: (gcloud.app.versions.list) The current Google Cloud project [tide-tables-123] does not contain an App Engine application.',
    },
    'harbour-web-456': {
      // Traffic split over two old revisions is no deploy: the listing covers this service.
      logs: [
        run('h3', 45, 'harbour-web-00213-xoz'),
        run('h2', 30, 'harbour-web-00211-abc'),
        run('h1', 10, 'harbour-web-00212-kel'),
      ],
      run: [
        revision('harbour-web', 'harbour-web-00213-xoz', '2026-05-06T07:42:00Z'),
        revision('harbour-web', 'harbour-web-00212-kel', '2026-05-05T09:00:00Z'),
        // A service with no entries shown is left out.
        revision('lantern-admin', 'lantern-admin-00004-qup', '2026-05-06T07:30:00Z'),
      ],
      app: [
        {
          id: '20260506t071500',
          service: 'harbour-web',
          version: { createTime: '2026-05-06T07:15:00Z' },
        },
      ],
    },
  });
  const found = await cloudDeploys({ run: runner, now: () => NOW }, CONFIG, { since: '1h' });
  expect(found.notes).toEqual([]);
  expect(found.deploys).toEqual([
    {
      project: 'harbour-web-456',
      service: 'harbour-web',
      revision: '20260506t071500',
      at: '2026-05-06T07:15:00Z',
      source: 'app-engine',
    },
    {
      project: 'harbour-web-456',
      service: 'harbour-web',
      revision: 'harbour-web-00213-xoz',
      at: '2026-05-06T07:42:00Z',
      source: 'cloud-run',
    },
    {
      project: 'tide-tables-123',
      service: 'tide-api',
      revision: 'b2b2',
      at: '2026-05-06T07:50:00Z',
      source: 'logs',
    },
  ]);
  const listings = calls
    .filter((c) => c.args[0] !== 'logging')
    .map((c) => c.args.slice(0, 3).join(' '));
  expect(listings.sort()).toEqual([
    'app versions list',
    'app versions list',
    'run revisions list',
    'run revisions list',
  ]);
});

test('a picked service limits the deploys to it, and a source that fails is a note, never an error', async () => {
  const { run: runner } = gcloudFor({
    'harbour-web-456': {
      logs: [],
      run: 'ERROR: (gcloud.run.revisions.list) PERMISSION_DENIED: caller lacks run.revisions.list',
      app: [
        { id: 'v7', service: 'harbour-web', version: { createTime: '2026-05-06T07:20:00Z' } },
        { id: 'v2', service: 'lantern-admin', version: { createTime: '2026-05-06T07:25:00Z' } },
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

test("a range's deploys are reused for two minutes, kept by its env, projects, services and since; one read with notes is not kept", async () => {
  const { run: runner, calls } = gcloudFor({
    'harbour-web-456': {
      logs: [run('h1', 10, 'harbour-web-00213-xoz')],
      run: [revision('harbour-web', 'harbour-web-00213-xoz', '2026-05-06T07:42:00Z')],
      app: [],
    },
    'tide-tables-123': { logs: [], run: [], app: [] },
  });
  let now = NOW;
  const deps = { run: runner, now: () => now };
  const cache = {
    file: join(tempDir(), 'cloud-deploys.json'),
    lock: { processId: 1, processAlive: () => true, clock: () => now },
  };
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

  const failing = gcloudFor({
    'harbour-web-456': { run: 'ERROR: (gcloud.run.revisions.list) boom' },
  });
  const noted = { ...cache, file: join(tempDir(), 'cloud-deploys.json') };
  await cloudDeploys({ run: failing.run, now: () => now }, CONFIG, {}, noted);
  const once = failing.calls.length;
  await cloudDeploys({ run: failing.run, now: () => now }, CONFIG, {}, noted);
  expect(failing.calls.length).toBe(2 * once);
});
