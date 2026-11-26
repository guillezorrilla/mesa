import { expect, test } from 'vitest';
import type { Http } from '../lib/http.js';
import { scriptedRunner } from '../testing/index.js';
import { cloudErrors, errorSamples, groupErrors } from './errors.js';
import { type GcpLogs, GcpLogsSchema } from './gcp-config.js';
import { maskGroup } from './mask.js';

const NOW = new Date('2026-05-06T07:10:00.000Z');
const CONFIG: GcpLogs = GcpLogsSchema.parse({ projects: ['tide-tables-123', 'harbour-web-456'] });

/** HTTP answering Error Reporting by project, and every URL it was asked. */
function errorReporting(byProject: Record<string, unknown>) {
  const asked: { url: string; auth: string | null }[] = [];
  const http: Http = async (url, init) => {
    asked.push({ url, auth: new Headers(init?.headers).get('authorization') });
    const project = decodeURIComponent(url.split('/projects/')[1]?.split('/')[0] ?? '');
    const body = byProject[project];
    return new Response(JSON.stringify(body ?? {}), { status: body === 403 ? 403 : 200 });
  };
  return { http, asked };
}

test("Error Reporting's groups with gcloud's token; a project with none has its errors grouped from the logs", async () => {
  const { http, asked } = errorReporting({
    'tide-tables-123': {
      errorGroupStats: [
        {
          group: { groupId: 'g-tides', resolutionStatus: 'OPEN' },
          count: '41',
          firstSeenTime: '2026-05-06T06:30:00Z',
          lastSeenTime: '2026-05-06T07:09:00Z',
          affectedServices: [{ service: 'tide-api' }],
          representative: {
            message: 'TideTableNotFound: station LC-04\n  at tides.load (tides.ts:9)',
          },
        },
        {
          group: { groupId: 'g-moor', resolutionStatus: 'RESOLVED' },
          count: 3,
          firstSeenTime: '2026-04-01T00:00:00Z',
          lastSeenTime: '2026-05-06T07:00:00Z',
          affectedServices: [{ service: 'tide-worker' }],
          representative: { message: 'mooring sync failed' },
        },
      ],
    },
  });
  const { run, calls } = scriptedRunner({
    gcloud: (args) =>
      args[0] === 'auth'
        ? 'ya29.invented\n'
        : JSON.stringify([
            {
              insertId: 'w1',
              timestamp: '2026-05-06T07:05:00Z',
              severity: 'ERROR',
              resource: { labels: { service_name: 'harbour-web' } },
              textPayload: 'checkout 502 for order 18233',
            },
            {
              insertId: 'w2',
              timestamp: '2026-05-06T07:06:00Z',
              severity: 'ERROR',
              resource: { labels: { service_name: 'harbour-web' } },
              textPayload: 'checkout 502 for order 18240',
            },
          ]),
  });
  const found = await cloudErrors({ run, http, now: () => NOW }, CONFIG, { since: '1h' });
  expect(found.warnings).toEqual([]);
  expect(
    found.groups.map((g) => [g.project, g.id, g.count, g.badge, g.source, g.services]),
  ).toEqual([
    ['tide-tables-123', 'g-tides', 41, 'new', 'error-reporting', ['tide-api']],
    ['tide-tables-123', 'g-moor', 3, 'back', 'error-reporting', ['tide-worker']],
    ['harbour-web-456', 'message:checkout # for order #', 2, null, 'logs', ['harbour-web']],
  ]);
  expect(found.groups[0]?.message).toBe('TideTableNotFound: station LC-04');
  expect(found.groups[2]?.samples?.map((s) => s.id)).toEqual(['w2', 'w1']);
  expect(asked[0]).toEqual({
    url: 'https://clouderrorreporting.googleapis.com/v1beta1/projects/tide-tables-123/groupStats?timeRange.period=PERIOD_1_HOUR&order=COUNT_DESC&pageSize=50',
    auth: 'Bearer ya29.invented',
  });
  // Each project's errors-only Logging read: the fallback, and the labels of the groups.
  const reads = calls.filter((call) => call.args[1] === 'read');
  expect(reads.map((call) => call.args[4]).sort()).toEqual(['harbour-web-456', 'tide-tables-123']);
  expect(reads[0]?.args[2]).toContain('severity>=ERROR');
});

test("samples are the group's recent events, their stacks whole", async () => {
  const { http, asked } = errorReporting({
    'tide-tables-123': {
      errorEvents: [
        {
          eventTime: '2026-05-06T07:09:00Z',
          message: 'TideTableNotFound\n  at tides.load',
          serviceContext: { service: 'tide-api' },
        },
      ],
    },
  });
  const { run } = scriptedRunner({ gcloud: 'ya29.invented' });
  expect(
    await errorSamples({ run, http, now: () => NOW }, 'tide-tables-123', 'g-tides', '6h'),
  ).toEqual([
    {
      time: '2026-05-06T07:09:00Z',
      service: 'tide-api',
      message: 'TideTableNotFound\n  at tides.load',
    },
  ]);
  expect(asked[0]?.url).toContain('/events?groupId=g-tides&timeRange.period=PERIOD_6_HOURS');
});

test('errors grouped from the logs group as the Logs panel groups them: by exception and frame, else the message', () => {
  const entry = (id: string, message: string, service = 'harbour-web') => ({
    project: 'harbour-web-456',
    id,
    time: `2026-05-06T07:0${id.length}:00Z`,
    severity: 'ERROR',
    service,
    message,
    trace: null,
    fields: {},
  });
  const groups = groupErrors('harbour-web-456', [
    entry('a', 'checkout 502 for order 18233'),
    entry('bb', 'checkout 502 for order 18240'),
    entry('ccc', 'TideTableNotFoundError: no table\n    at tides.load (tides.ts:41)', 'tide-api'),
  ]);
  expect(groups.map((g) => [g.count, g.message, g.services])).toEqual([
    [2, 'checkout 502 for order 18233', ['harbour-web']],
    [1, 'TideTableNotFoundError at tides.ts:41', ['tide-api']],
  ]);
  expect(groups[1]?.sample).toContain('at tides.load');
});

test('Error Reporting that cannot be read is a warning with its fix, and the errors still come grouped from the logs', async () => {
  const { http } = errorReporting({ 'tide-tables-123': 403, 'harbour-web-456': 403 });
  const { run } = scriptedRunner({
    gcloud: (args) =>
      args[0] === 'auth'
        ? 'ya29.invented'
        : JSON.stringify([
            {
              insertId: 'w1',
              timestamp: '2026-05-06T07:05:00Z',
              severity: 'ERROR',
              resource: { labels: { container_name: 'tide-api' } },
              textPayload: 'lookup failed',
            },
          ]),
  });
  const found = await cloudErrors({ run, http, now: () => NOW }, CONFIG, {});
  expect(found.groups.map((g) => g.source)).toEqual(['logs', 'logs']);
  expect(found.warnings).toEqual([
    {
      project: 'tide-tables-123',
      message: expect.stringContaining(
        'Error Reporting could not be read for tide-tables-123 (the Error Reporting API is off',
      ),
      fix: 'gcloud services enable clouderrorreporting.googleapis.com --project tide-tables-123',
      action: 'enable',
    },
    expect.objectContaining({ project: 'harbour-web-456' }),
  ]);
  // Signed out: the token itself fails, once, and the read is that error, whose fix is to sign in.
  const signedOut = scriptedRunner({
    gcloud: (args) =>
      args[0] === 'auth'
        ? {
            ok: false,
            reason: 'failed',
            detail: 'You do not currently have an active account selected.',
            output: 'You do not currently have an active account selected.',
          }
        : '[]',
  }).run;
  await expect(
    cloudErrors({ run: signedOut, http, now: () => NOW }, CONFIG, {}),
  ).rejects.toMatchObject({
    details: { reason: 'signed_out', fix: 'gcloud auth login', action: 'login' },
  });
});

test("Error Reporting's groups follow the picked services: one through its service filter, several filtered here", async () => {
  const { http, asked } = errorReporting({
    'tide-tables-123': {
      errorGroupStats: [
        {
          group: { groupId: 'a' },
          count: 1,
          affectedServices: [{ service: 'tide-api' }],
          representative: { message: 'x' },
        },
        {
          group: { groupId: 'b' },
          count: 1,
          affectedServices: [{ service: 'tide-worker' }],
          representative: { message: 'y' },
        },
        {
          group: { groupId: 'c' },
          count: 1,
          affectedServices: [{ service: 'other' }],
          representative: { message: 'z' },
        },
      ],
    },
  });
  const { run } = scriptedRunner({ gcloud: 'ya29.invented' });
  await cloudErrors({ run, http, now: () => NOW }, CONFIG, {
    services: ['tide-tables-123/tide-api'],
  });
  expect(asked.at(-1)?.url).toContain('&serviceFilter.service=tide-api');
  const several = await cloudErrors({ run, http, now: () => NOW }, CONFIG, {
    services: ['tide-tables-123/tide-api', 'tide-tables-123/tide-worker'],
  });
  expect(several.groups.map((g) => g.id)).toEqual(['a', 'b']);
});

test('a group masks everything it carries from the logs', () => {
  const group = {
    project: 'p',
    id: 'message:login failed for a@b.example',
    message: 'login failed for a@b.example from 10.0.0.1',
    sample: 'a@b.example',
    count: 1,
    firstSeen: '',
    lastSeen: '',
    services: ['svc'],
    badge: null,
    source: 'logs' as const,
    samples: [
      {
        project: 'p',
        id: 'i',
        time: '',
        severity: 'ERROR',
        service: 'svc',
        message: '10.0.0.1',
        trace: null,
        fields: { user: 'a@b.example' },
      },
    ],
  };
  expect(JSON.stringify(maskGroup(group))).not.toMatch(/a@b\.example|10\.0\.0\.1/);
});

test("with an env picked, groups come from that env's logs with Error Reporting's badge and all-env count; for every env, Error Reporting's groups take the logs' service names", async () => {
  const STACK = 'TideTableNotFound: station LC-04\n    at tides.load (tides.ts:9)';
  const { http } = errorReporting({
    'tide-tables-123': {
      errorGroupStats: [
        {
          group: { groupId: 'g-tides', resolutionStatus: 'OPEN' },
          count: 412,
          firstSeenTime: '2026-05-06T06:30:00Z',
          lastSeenTime: '2026-05-06T07:01:00Z',
          affectedServices: [{ service: 'gke_instances' }],
          representative: { message: STACK },
        },
        {
          group: { groupId: 'g-other' },
          count: 9,
          firstSeenTime: '2026-04-01T00:00:00Z',
          affectedServices: [{ service: 'gke_instances' }],
          representative: { message: 'mooring sync failed' },
        },
      ],
    },
  });
  const { run, calls } = scriptedRunner({
    gcloud: (args) =>
      args[0] === 'auth'
        ? 'ya29.invented'
        : JSON.stringify(
            args[4] === 'tide-tables-123'
              ? [
                  {
                    insertId: 't1',
                    timestamp: '2026-05-06T07:08:00Z',
                    severity: 'ERROR',
                    resource: { type: 'k8s_container', labels: { container_name: 'tide-api' } },
                    textPayload: STACK,
                  },
                ]
              : [],
          ),
  });
  const config = GcpLogsSchema.parse({
    projects: ['tide-tables-123'],
    envs: { beta: 'resource.labels.cluster_name="harbour-beta"' },
  });
  const beta = await cloudErrors({ run, http, now: () => NOW }, config, { env: 'beta' });
  expect(beta.env).toBe('beta');
  expect(beta.groups).toEqual([
    expect.objectContaining({
      source: 'logs',
      count: 1,
      badge: 'new',
      services: ['tide-api'],
      reported: { id: 'g-tides', count: 412 },
    }),
  ]);
  expect(calls.find((c) => c.args[1] === 'read')?.args[2]).toContain('harbour-beta');
  const all = await cloudErrors({ run, http, now: () => NOW }, config, { env: '*' });
  expect(all.env).toBeNull();
  expect(all.groups.map((g) => [g.id, g.services, g.lastSeen])).toEqual([
    ['g-tides', ['tide-api'], '2026-05-06T07:08:00Z'],
    ['g-other', [], ''],
  ]);
});
