import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/index.js';
import { askCloudLogs, askInput } from './ask.js';
import { envNameOf, joinEnvs } from './env-names.js';
import { cloudFilter, cloudLogs } from './gcp.js';
import { filterProblem, type GcpLogs, GcpLogsSchema, PROD_WORD } from './gcp-config.js';
import { envSuggestions } from './gcp-envs.js';
import { cloudProjects } from './gcp-projects.js';
import { cloudServices } from './gcp-services.js';
import { OWN_SERVICES_FILTER } from './noise.js';
import { NO_ORGANIZATION, type ProjectRow, projectRows } from './project-rows.js';

const NOW = new Date('2026-05-06T07:10:00.000Z');
const CONFIG: GcpLogs = GcpLogsSchema.parse({
  projects: ['tide-tables-123', 'harbour-web-456'],
  envs: {
    beta: 'resource.labels.cluster_name="harbour-beta"',
    prod: 'resource.labels.cluster_name="harbour"',
  },
});
const ONE: GcpLogs = { ...CONFIG, projects: ['tide-tables-123'] };

/** Invented entries as `gcloud logging read --format json` prints them, newest first. */
const ENTRIES = [
  {
    insertId: 'aa11',
    timestamp: '2026-05-06T07:09:00Z',
    severity: 'ERROR',
    resource: { type: 'k8s_container', labels: { container_name: 'tide-api' } },
    jsonPayload: { message: 'high water lookup failed', port: 'lantern-cove' },
    trace: 'projects/tide-tables-123/traces/0f0f',
  },
  {
    insertId: 'bb22',
    timestamp: '2026-05-06T07:08:00Z',
    severity: 'WARNING',
    resource: { type: 'cloud_run_revision', labels: { service_name: 'tide-worker' } },
    textPayload: 'queue is slow',
  },
  {
    insertId: 'cc33',
    timestamp: '2026-05-06T07:07:00Z',
    resource: { type: 'gae_app', labels: {} },
    jsonPayload: { status: 500, path: '/tides' },
  },
];
/** What the second project logged: one Cloud Run entry between the first's. */
const WEB = [
  {
    insertId: 'dd44',
    timestamp: '2026-05-06T07:08:30Z',
    severity: 'ERROR',
    resource: { type: 'cloud_run_revision', labels: { service_name: 'harbour-web' } },
    textPayload: 'checkout page 502',
    trace: 'projects/harbour-web-456/traces/0f0f',
  },
];

/** gcloud answering each project with its own entries. */
const byProject = (answers: Record<string, string>) =>
  scriptedRunner({
    gcloud: (args) => answers[args[args.indexOf('--project') + 1] as string] ?? '[]',
  });

test('the filter is the env, the picked services under each kind, severity, trace, text and time, each value quoted', () => {
  expect(
    cloudFilter(
      CONFIG,
      { env: 'beta', severity: 'error', trace: '0f0f', text: 'LC-04', since: '30m', all: true },
      NOW,
      ['tide "api"'],
    ),
  ).toBe(
    '(resource.labels.cluster_name="harbour-beta") AND (resource.labels.container_name="tide \\"api\\"" OR resource.labels.service_name="tide \\"api\\"" OR resource.labels.module_id="tide \\"api\\"") AND severity>=ERROR AND trace:"0f0f" AND "LC-04" AND timestamp>="2026-05-06T06:40:00.000Z"',
  );
  // No env: the first; no since: the last hour; a configured label path is the only one.
  expect(cloudFilter({ ...CONFIG, service: 'labels.app' }, { all: true }, NOW, ['tide-api'])).toBe(
    '(resource.labels.cluster_name="harbour-beta") AND labels.app="tide-api" AND timestamp>="2026-05-06T06:10:00.000Z"',
  );
  // No envs at all: the whole project.
  expect(cloudFilter({ ...CONFIG, envs: {} }, { all: true }, NOW)).toBe(
    'timestamp>="2026-05-06T06:10:00.000Z"',
  );
  expect(() => cloudFilter(CONFIG, { env: 'staging' }, NOW)).toThrow(
    'no env staging in logs.gcp.envs: beta, prod',
  );
});

test('by default a read leaves out load balancer, proxy, GKE system, audit and event entries', () => {
  const filter = cloudFilter({ ...CONFIG, envs: {} }, {}, NOW);
  expect(filter).toBe(`${OWN_SERVICES_FILTER} AND timestamp>="2026-05-06T06:10:00.000Z"`);
  for (const noise of [
    'http_load_balancer',
    'run.googleapis.com/requests',
    'kube-system',
    'cilium',
    'cloudaudit.googleapis.com',
    'log_id("events")',
  ])
    expect(OWN_SERVICES_FILTER).toContain(noise);
});

test('each project is read at once with the same filter as an argv and merged newest first, each entry naming its project', async () => {
  const { run, calls } = byProject({
    'tide-tables-123': JSON.stringify(ENTRIES),
    'harbour-web-456': JSON.stringify(WEB),
  });
  const read = await cloudLogs({ run, now: () => NOW }, CONFIG, {
    env: 'prod',
    severity: 'warning',
    limit: 3,
    all: true,
  });
  const filter =
    '(resource.labels.cluster_name="harbour") AND severity>=WARNING AND timestamp>="2026-05-06T06:10:00.000Z"';
  expect(read.filters).toEqual({ 'tide-tables-123': filter, 'harbour-web-456': filter });
  expect(calls.map((call) => call.args)).toEqual([
    ['logging', 'read', filter, '--project', 'tide-tables-123', '--format', 'json', '--limit', '3'],
    ['logging', 'read', filter, '--project', 'harbour-web-456', '--format', 'json', '--limit', '3'],
  ]);
  expect(read.warnings).toEqual([]);
  expect(read.entries).toEqual([
    {
      project: 'tide-tables-123',
      id: 'aa11',
      time: '2026-05-06T07:09:00Z',
      severity: 'ERROR',
      service: 'tide-api',
      message: 'high water lookup failed',
      trace: 'projects/tide-tables-123/traces/0f0f',
      fields: { port: 'lantern-cove' },
    },
    {
      project: 'harbour-web-456',
      id: 'dd44',
      time: '2026-05-06T07:08:30Z',
      severity: 'ERROR',
      service: 'harbour-web',
      message: 'checkout page 502',
      trace: 'projects/harbour-web-456/traces/0f0f',
      fields: {},
    },
    {
      project: 'tide-tables-123',
      id: 'bb22',
      time: '2026-05-06T07:08:00Z',
      severity: 'WARNING',
      service: 'tide-worker',
      message: 'queue is slow',
      trace: null,
      fields: {},
    },
  ]);
  // The App Engine entry with no message reads as its JSON; a label path set is the only one read.
  const app = await cloudLogs(
    { run: byProject({ 'tide-tables-123': JSON.stringify(ENTRIES) }).run, now: () => NOW },
    { ...ONE, service: 'jsonPayload.port' },
    {},
  );
  expect(app.entries.map((entry) => [entry.service, entry.message])).toEqual([
    ['lantern-cove', 'high water lookup failed'],
    [null, 'queue is slow'],
    [null, '{"status":500,"path":"/tides"}'],
  ]);
  await expect(cloudLogs({ run, now: () => NOW }, CONFIG, { limit: 5000 })).rejects.toThrow(
    '--limit must be 1 to 1000, not 5000',
  );
});

test('picked services read only their projects, each with its own names; an unknown project is usage', async () => {
  const { run, calls } = byProject({ 'harbour-web-456': JSON.stringify(WEB) });
  const read = await cloudLogs({ run, now: () => NOW }, CONFIG, {
    services: ['harbour-web-456/harbour-web'],
  });
  expect(calls.map((call) => call.args[4])).toEqual(['harbour-web-456']);
  expect(read.filters['harbour-web-456']).toContain('resource.labels.service_name="harbour-web"');
  expect(read.entries.map((entry) => entry.id)).toEqual(['dd44']);
  await expect(
    cloudLogs({ run, now: () => NOW }, CONFIG, { services: ['quiet-reef-9/tide-api'] }),
  ).rejects.toThrow('no GCP project quiet-reef-9 in logs.gcp.projects');
  await expect(
    cloudLogs({ run, now: () => NOW }, CONFIG, { services: ['tide-api'] }),
  ).rejects.toThrow('--service must be <project>/<name>, not tide-api');
});

test('a project that fails is a warning with its fix while the others read; every one failing is the error', async () => {
  const run = scriptedRunner({
    gcloud: (args) =>
      args.includes('harbour-web-456')
        ? { ok: false, reason: 'failed', detail: 'PERMISSION_DENIED', output: 'PERMISSION_DENIED' }
        : JSON.stringify(ENTRIES),
  }).run;
  const read = await cloudLogs({ run, now: () => NOW }, CONFIG, {});
  expect(read.entries).toHaveLength(3);
  expect(read.warnings).toEqual([
    {
      project: 'harbour-web-456',
      message: expect.stringContaining('cannot read the logs of harbour-web-456'),
      fix: 'gcloud auth login',
    },
  ]);
  const none = scriptedRunner({}, { missing: ['gcloud'] }).run;
  await expect(cloudLogs({ run: none, now: () => NOW }, CONFIG, {})).rejects.toMatchObject({
    details: { reason: 'gcloud_missing' },
  });
});

test("services are what every project's entries of the last hour name and what its resources list, each with its project and kind", async () => {
  const { run, calls } = scriptedRunner({
    gcloud: (args) => {
      const project =
        args[args.indexOf('--project') + 1] ??
        args.find((a) => a.startsWith('--scope='))?.slice(17);
      if (args[0] === 'logging')
        return project === 'tide-tables-123'
          ? 'k8s_container\ttide-api\t\t\ngae_app\t\t\tharbour\nk8s_container\ttide-api\t\t\n'
          : 'cloud_run_revision\t\tharbour-web\t\n';
      // A Cloud Run service that logged nothing this hour still lists; GKE's listing fails.
      if (args[0] === 'run' && project === 'harbour-web-456')
        return JSON.stringify([
          { metadata: { name: 'harbour-web' } },
          { metadata: { name: 'night-batch' } },
        ]);
      if (args[0] === 'asset') return { ok: false, reason: 'failed', detail: 'API not enabled' };
      return '[]';
    },
  });
  expect(await cloudServices({ run, now: () => NOW }, CONFIG, 'beta')).toEqual({
    services: [
      { project: 'harbour-web-456', name: 'harbour-web', kind: 'Cloud Run' },
      { project: 'harbour-web-456', name: 'night-batch', kind: 'Cloud Run' },
      { project: 'tide-tables-123', name: 'harbour', kind: 'App Engine' },
      { project: 'tide-tables-123', name: 'tide-api', kind: 'GKE' },
    ],
    warnings: [],
  });
  expect(calls.find((call) => call.args[0] === 'logging')?.args.slice(-4)).toEqual([
    '--format',
    'value(resource.type,resource.labels.container_name,resource.labels.service_name,resource.labels.module_id)',
    '--limit',
    '1000',
  ]);
});

test("setup lists every project once, by name, with gcloud's default and their organizations and folders; a search filters them locally", async () => {
  const { run, calls } = scriptedRunner({
    gcloud: (args) => {
      if (args[0] === 'config') return 'tide-tables-123\n';
      if (args[0] === 'organizations')
        return JSON.stringify([{ name: 'organizations/11', displayName: 'Harbour Co' }]);
      if (args[1] === 'folders')
        return JSON.stringify(
          args[3] === '22'
            ? { name: 'folders/22', displayName: 'Web', parent: 'folders/33' }
            : { name: 'folders/33', displayName: 'Products', parent: 'organizations/11' },
        );
      return JSON.stringify([
        { projectId: 'tide-web-9', parent: { type: 'folder', id: '22' } },
        {
          projectId: 'tide-tables-123',
          name: 'Tide tables',
          parent: { type: 'organization', id: '11' },
        },
        { projectId: 'quay-ops-7', name: 'Quay ops' },
      ]);
    },
  });
  expect(await cloudProjects(run)).toEqual({
    current: 'tide-tables-123',
    projects: [
      { id: 'quay-ops-7', name: 'Quay ops' },
      { id: 'tide-tables-123', name: 'Tide tables', parent: 'organizations/11' },
      { id: 'tide-web-9', name: 'tide-web-9', parent: 'folders/22' },
    ],
    groups: {
      'organizations/11': { name: 'Harbour Co' },
      'folders/22': { name: 'Web', parent: 'folders/33' },
      'folders/33': { name: 'Products', parent: 'organizations/11' },
    },
  });
  expect(calls.find((call) => call.args[0] === 'projects')?.args).toEqual([
    'projects',
    'list',
    '--format',
    'json(projectId,name,parent)',
  ]);
  expect((await cloudProjects(run, 'TIDE" OR x')).projects).toEqual([]);
  expect((await cloudProjects(run, 'ops')).projects).toEqual([
    { id: 'quay-ops-7', name: 'Quay ops' },
  ]);
});

test('project rows: pinned first, No organization, then each organization with its folders nested; a filter opens what matches', async () => {
  const projects = [
    { id: 'quay-ops-7', name: 'Quay ops' },
    { id: 'tide-tables-123', name: 'Tide tables', parent: 'organizations/11' },
    { id: 'tide-web-9', name: 'Tide web', parent: 'folders/22' },
    ...Array.from({ length: 21 }, (_, i) => ({
      id: `lab-${i}`,
      name: `Lab ${i}`,
      parent: 'folders/44',
    })),
    { id: 'lost-1', name: 'Lost', parent: 'organizations/99' },
  ];
  const groups = {
    'organizations/11': { name: 'Harbour Co' },
    'folders/22': { name: 'Web', parent: 'folders/33' },
    'folders/33': { name: 'Products', parent: 'organizations/11' },
    'folders/44': { name: 'Sandbox', parent: 'organizations/11' },
  };
  const line = (row: ProjectRow) =>
    `${'  '.repeat(row.depth)}${row.kind === 'group' ? `[${row.open ? '-' : '+'}] ${row.name} ${row.count}` : row.id}`;
  const all = projectRows(projects, groups, { pinned: ['tide-tables-123'] }).map(line);
  expect(all).toEqual([
    'tide-tables-123',
    '[-] No organization 1',
    '  quay-ops-7',
    '[-] Harbour Co 23',
    '  [-] Products 1',
    '    [-] Web 1',
    '      tide-web-9',
    '  [+] Sandbox 21',
    '  tide-tables-123',
    '[-] Organization 99 1',
    '  lost-1',
  ]);
  expect(
    projectRows(projects, groups, { toggled: new Set(['folders/44', 'organizations/99']) })
      .map(line)
      .filter((l) => l.includes('Sandbox') || l.includes('lab-0') || l.includes('99')),
  ).toEqual(['  [-] Sandbox 21', '    lab-0', '[+] Organization 99 1']);
  expect(
    projectRows(projects, groups, { term: 'web', pinned: ['tide-tables-123'] }).map(line),
  ).toEqual(['[-] Harbour Co 1', '  [-] Products 1', '    [-] Web 1', '      tide-web-9']);
  expect(projectRows(projects, groups, { org: NO_ORGANIZATION }).map(line)).toEqual([
    '[-] No organization 1',
    '  quay-ops-7',
  ]);
  // A group's name matches all it holds.
  expect(
    projectRows(projects, groups, { term: 'sandbox' }).filter((r) => r.kind === 'project'),
  ).toHaveLength(21);
});

test('envs are suggested per GKE cluster, named from it, and from Cloud Run env suffixes; envs of one name join', async () => {
  const { run, calls } = scriptedRunner({
    gcloud: (args) => {
      const project = args[args.indexOf('--project') + 1];
      if (args[0] === 'container')
        return project === 'tide-tables-123'
          ? JSON.stringify([
              { name: 'harbour-prod-1' },
              { name: 'harbour-beta' },
              { name: 'sandbox' },
            ])
          : 'ERROR: container API not enabled';
      return JSON.stringify(
        project === 'harbour-web-456'
          ? [{ metadata: { name: 'checkout' } }, { metadata: { name: 'checkout-staging' } }]
          : [],
      );
    },
  });
  const { suggestions } = await envSuggestions(run, ['tide-tables-123', 'harbour-web-456']);
  expect(suggestions).toEqual([
    {
      name: 'beta',
      filter: 'resource.labels.cluster_name="harbour-beta"',
      from: 'GKE cluster harbour-beta',
    },
    {
      name: 'prod',
      filter: 'resource.labels.cluster_name="harbour-prod-1"',
      from: 'GKE cluster harbour-prod-1',
    },
    {
      name: 'sandbox',
      filter: 'resource.labels.cluster_name="sandbox"',
      from: 'GKE cluster sandbox',
    },
    {
      name: 'staging',
      filter: 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"-staging$"',
      from: 'Cloud Run services ending -staging',
    },
    {
      name: 'prod',
      filter:
        'resource.type="cloud_run_revision" AND NOT resource.labels.service_name=~"-(staging)$"',
      from: 'Cloud Run services with no env suffix',
    },
  ]);
  expect(calls.every((call) => call.args.includes('--project'))).toBe(true);
  expect(envNameOf('Production-EU')).toBe('prod');
  const envs = joinEnvs([...suggestions, { name: '', filter: 'x' }]);
  expect(envs.prod).toBe(
    '(resource.labels.cluster_name="harbour-prod-1") OR (resource.type="cloud_run_revision" AND NOT resource.labels.service_name=~"-(staging)$")',
  );
  expect(Object.keys(envs)).toEqual(['beta', 'prod', 'sandbox', 'staging']);
  for (const filter of Object.values(envs)) expect(filterProblem(filter)).toBeUndefined();
});

test('missing gcloud, no signed-in account and no access are each an error that names the fix', async () => {
  const deps = (run: Parameters<typeof cloudLogs>[0]['run']) => ({ run, now: () => NOW });
  const missing = scriptedRunner({}, { missing: ['gcloud'] }).run;
  await expect(cloudLogs(deps(missing), ONE, {})).rejects.toMatchObject({
    code: 'not_found',
    details: { reason: 'gcloud_missing' },
    message: expect.stringContaining('install the Google Cloud CLI'),
  });
  const failing = (output: string) =>
    scriptedRunner({ gcloud: () => ({ ok: false, reason: 'failed', detail: output, output }) }).run;
  await expect(
    cloudLogs(
      deps(
        failing(
          'ERROR: (gcloud.logging.read) You do not currently have an active account selected.',
        ),
      ),
      ONE,
      {},
    ),
  ).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'gcloud has no signed-in account: run gcloud auth login',
    details: { reason: 'signed_out', fix: 'gcloud auth login' },
  });
  const garbled = scriptedRunner({ gcloud: '[{"insertId": "aa' }).run;
  await expect(cloudLogs(deps(garbled), ONE, {})).rejects.toMatchObject({
    code: 'internal',
    message: 'gcloud printed no JSON list',
  });
  await expect(
    cloudLogs(
      deps(failing('ERROR: PERMISSION_DENIED: the caller lacks credentials for this project')),
      ONE,
      {},
    ),
  ).rejects.toMatchObject({ details: { reason: 'permission_denied' } });
  await expect(
    cloudLogs(deps(failing('ERROR: (gcloud.logging.read) PERMISSION_DENIED: denied')), ONE, {}),
  ).rejects.toMatchObject({
    code: 'invalid_config',
    message: expect.stringContaining(
      'cannot read the logs of tide-tables-123: run gcloud auth login',
    ),
    details: { reason: 'permission_denied', fix: 'gcloud auth login' },
  });
});

test('logs.gcp is strict: a list of projects, envs optional, a domain-scoped id passes, a malformed one fails', () => {
  expect(GcpLogsSchema.parse({ projects: ['harbour.example:tide-tables-123'] })).toEqual({
    projects: ['harbour.example:tide-tables-123'],
    envs: {},
  });
  for (const bad of [
    { projects: [] },
    { projects: ['Tide Tables'] },
    { project: 'tide-tables-123' },
    { projects: ['tide-tables-123'], service: 'labels; rm -rf' },
    { projects: ['tide-tables-123'], envs: { 'be ta': 'x' } },
  ])
    expect(GcpLogsSchema.safeParse(bad).success).toBe(false);
});

test('Ask runs cloud-logs with the question, the filter and the entries fenced as data, and cites the ids its answer names', async () => {
  const entries = (
    await cloudLogs(
      { run: scriptedRunner({ gcloud: JSON.stringify(ENTRIES) }).run, now: () => NOW },
      ONE,
      {},
    )
  ).entries;
  const asked: { skill: string; project: string; input: string }[] = [];
  // cc33 named in prose is no citation.
  const answer = 'The tide-api lookups fail [aa11]; the worker queue is slow [bb22], unlike cc33.';
  const done = await askCloudLogs(
    async (skill, opts) => {
      asked.push({ skill, ...opts });
      return { result: { session: 'run12345', ok: true, output: `${answer}\n`, durationMs: 900 } };
    },
    'what fails most?',
    { filter: 'severity>=ERROR', entries },
  );
  expect(done).toEqual({
    answer,
    cited: ['aa11', 'bb22'],
    run: { session: 'run12345', durationMs: 900 },
  });
  expect(asked).toEqual([
    {
      skill: 'cloud-logs',
      project: '__mesa_general__',
      input: askInput('what fails most?', 'severity>=ERROR', entries),
    },
  ]);
  expect(asked[0]?.input).toMatch(/^Question:\nwhat fails most\?\n/);
  expect(asked[0]?.input).toContain('```jsonl\n{"project":"tide-tables-123","id":"aa11"');
  await expect(
    askCloudLogs(
      async () => ({
        result: { session: 'run6', ok: false, output: '', durationMs: 1, reason: 'exit 1' },
      }),
      'why?',
      { filter: '', entries },
    ),
  ).rejects.toThrow('the cloud-logs run run6 gave no answer: exit 1');
});

test('a filter of its own must be one expression: a view or flag cannot escape the env, noise and time bounds', () => {
  expect(() => cloudFilter(CONFIG, { filter: 'x) OR (y' }, NOW)).toThrow(
    '--filter must be one Logging filter: it closes a parenthesis it did not open',
  );
  expect(() => cloudFilter(CONFIG, { filter: 'jsonPayload.a="b' }, NOW)).toThrow(
    'leaves a quote open',
  );
  expect(cloudFilter(CONFIG, { all: true, filter: 'jsonPayload.a="(x"' }, NOW)).toContain(
    '(jsonPayload.a="(x")',
  );
  for (const bad of [
    { projects: ['tide-tables-123'], envs: { beta: 'a) OR (b' } },
    { projects: ['tide; rm -rf'] },
  ])
    expect(GcpLogsSchema.safeParse(bad).success).toBe(false);
  // Legacy and domain-scoped project ids pass.
  expect(
    GcpLogsSchema.safeParse({ projects: ['tide', 'harbour.example:web', 'Old-Tides.1'] }).success,
  ).toBe(true);
});

test('a filter names prod when a word of it is prod or production, as a cluster, namespace or service', () => {
  for (const yes of [
    'resource.labels.cluster_name="prod"',
    'cluster_name="prod-1"',
    'service_name="prod_api"',
    'namespace="production"',
  ])
    expect(PROD_WORD.test(yes), yes).toBe(true);
  for (const no of ['cluster_name="product-svc"', 'service="reprod"', 'beta'])
    expect(PROD_WORD.test(no), no).toBe(false);
});
