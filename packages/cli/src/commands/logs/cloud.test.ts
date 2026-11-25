import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Runner, readOnlyTools } from '@mesa/core';
import { claudeAnswer, finishesRun } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';
import { COMMANDS } from '../index.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

/** Invented entries, as `gcloud logging read --format json` prints them. */
const ENTRIES = [
  {
    insertId: 'aa11',
    timestamp: '2026-05-06T07:09:00Z',
    severity: 'ERROR',
    resource: { type: 'k8s_container', labels: { container_name: 'tide-api' } },
    jsonPayload: { message: 'high water lookup failed' },
  },
];
/** The second project's: its Cloud Run web app. */
const WEB = [
  {
    insertId: 'bb22',
    timestamp: '2026-05-06T07:08:00Z',
    severity: 'ERROR',
    resource: { type: 'cloud_run_revision', labels: { service_name: 'harbour-web' } },
    textPayload: 'checkout stalled',
  },
];

/** The runner as it was, with gcloud answering as `answer` says and every gcloud argv kept. */
function withGcloud(answer: (args: string[], project: string) => string) {
  const base = cli.run;
  const calls: string[][] = [];
  const run: Runner = async (file, args, timeoutMs, options) => {
    if (file !== 'gcloud') return base(file, args, timeoutMs, options);
    calls.push(args);
    return { ok: true, stdout: answer(args, args[args.indexOf('--project') + 1] ?? '') };
  };
  cli.run = run;
  return calls;
}

/** Cloud Logs set up on an invented GCP project, beta and prod told apart by cluster. */
const setUp = () =>
  mesa(
    'logs',
    'setup',
    '--project',
    'tide-tables-123',
    '--project',
    'harbour-web-456',
    '--env',
    'beta=resource.labels.cluster_name="harbour-beta"',
    '--env',
    'prod=resource.labels.cluster_name="harbour"',
    '--json',
  );

test("logs gcp says to set it up first; setup writes the profile's logs.gcp; then it reads every project, merged, and their services", async () => {
  await cli.withProject();
  const none = await mesa('logs', 'gcp', '--json');
  expect(none.code).toBe(3);
  expect(none.json.error.details).toEqual({ reason: 'not_configured' });

  const calls = withGcloud((args, project) =>
    args[0] === 'projects'
      ? JSON.stringify([{ projectId: 'tide-tables-123', name: 'Tide tables' }])
      : args.includes('json')
        ? JSON.stringify(project === 'tide-tables-123' ? ENTRIES : WEB)
        : project === 'tide-tables-123'
          ? 'k8s_container\ttide-api\t\t\n'
          : 'cloud_run_revision\t\tharbour-web\t\n',
  );
  expect((await mesa('logs', 'projects', '--search', 'tide', '--json')).json.data).toEqual({
    current: null,
    projects: [{ id: 'tide-tables-123', name: 'Tide tables' }],
    groups: {},
  });
  expect((await setUp()).json.data.gcp).toEqual({
    projects: ['tide-tables-123', 'harbour-web-456'],
    envs: {
      beta: 'resource.labels.cluster_name="harbour-beta"',
      prod: 'resource.labels.cluster_name="harbour"',
    },
  });
  expect(readFileSync(cli.paths.config, 'utf8')).toContain('harbour-web-456');

  const read = await mesa(
    'logs',
    'gcp',
    '--env',
    'beta',
    '--severity',
    'ERROR',
    '--limit',
    '20',
    '--json',
  );
  expect(read.code).toBe(0);
  const filter = read.json.data.filters['tide-tables-123'];
  expect(filter).toMatch(
    /^\(resource\.labels\.cluster_name="harbour-beta"\) AND severity>=ERROR AND NOT resource\.type=/,
  );
  expect(read.json.data).toEqual({
    projects: ['tide-tables-123', 'harbour-web-456'],
    env: 'beta',
    envs: ['beta', 'prod'],
    filters: { 'tide-tables-123': filter, 'harbour-web-456': filter },
    warnings: [],
    entries: [
      {
        project: 'tide-tables-123',
        id: 'aa11',
        time: '2026-05-06T07:09:00Z',
        severity: 'ERROR',
        service: 'tide-api',
        message: 'high water lookup failed',
        trace: null,
        fields: {},
      },
      {
        project: 'harbour-web-456',
        id: 'bb22',
        time: '2026-05-06T07:08:00Z',
        severity: 'ERROR',
        service: 'harbour-web',
        message: 'checkout stalled',
        trace: null,
        fields: {},
      },
    ],
  });
  expect(calls.slice(-2).map((args) => args[4])).toEqual(['tide-tables-123', 'harbour-web-456']);
  const one = await mesa(
    'logs',
    'gcp',
    '--service',
    'harbour-web-456/harbour-web',
    '--trace',
    '0f0f',
    '--json',
  );
  expect(Object.keys(one.json.data.filters)).toEqual(['harbour-web-456']);
  expect(one.json.data.filters['harbour-web-456']).toContain('trace:"0f0f"');
  expect((await mesa('logs', 'gcp', '--services', '--env', 'beta', '--json')).json.data).toEqual({
    env: 'beta',
    services: [
      { project: 'harbour-web-456', name: 'harbour-web', kind: 'Cloud Run' },
      { project: 'tide-tables-123', name: 'tide-api', kind: 'GKE' },
    ],
    warnings: [],
  });
  expect(await mesa('logs', 'gcp', '--severity', 'loud')).toMatchObject({ code: 2 });
  expect(await mesa('logs', 'gcp', '--env', 'staging')).toMatchObject({
    code: 2,
    stderr: 'no env staging in logs.gcp.envs: beta, prod\n',
  });
  expect(
    await mesa('logs', 'setup', '--project', 'tide-tables-123', '--env', 'beta'),
  ).toMatchObject({ code: 2 });
  expect(await mesa('logs', 'setup', '--json')).toMatchObject({ code: 4 });
  withGcloud((args) =>
    args[0] === 'container' ? JSON.stringify([{ name: 'harbour-beta' }]) : '[]',
  );
  expect((await mesa('logs', 'envs', '--project', 'tide-tables-123', '--json')).json.data).toEqual({
    suggestions: [
      {
        name: 'beta',
        filter: 'resource.labels.cluster_name="harbour-beta"',
        from: 'GKE cluster harbour-beta',
      },
    ],
  });
  expect(await mesa('logs', 'envs', '--project', 'a;b', '--json')).toMatchObject({ code: 4 });
  // Recent keeps the projects set up, newest first; a star is kept and taken off.
  expect(readFileSync(cli.paths.config, 'utf8')).toMatch(
    /recentProjects:\s*\n\s*- tide-tables-123\n\s*- harbour-web-456/,
  );
  expect((await mesa('logs', 'star', 'quay-ops-7', '--json')).json.data).toEqual({
    starred: ['quay-ops-7'],
  });
  expect((await mesa('logs', 'star', 'quay-ops-7', '--off', '--json')).json.data).toEqual({
    starred: [],
  });
  expect((await mesa('help', '--agent')).stdout).toContain('mesa logs setup');
});

test('logs ask runs in General and cites entries; prod asks once per GCP project, a person confirms; the newest Asks are kept', async () => {
  const answer = 'Lookups fail on tide-api [aa11], and checkout stalls [bb22].';
  const tmux = cli.withTmux({ onOpen: finishesRun({ output: claudeAnswer(answer) }) });
  await cli.withProject();
  withGcloud((_, project) => JSON.stringify(project === 'tide-tables-123' ? ENTRIES : WEB));
  await setUp();

  const beta = await mesa('logs', 'ask', 'what fails most?', '--env', 'beta', '--json');
  expect(beta.json.error).toBeUndefined();
  expect(beta.code).toBe(0);
  expect(beta.json.data).toMatchObject({
    projects: ['tide-tables-123', 'harbour-web-456'],
    env: 'beta',
    answer,
    cited: ['aa11', 'bb22'],
    entries: [{ id: 'aa11' }, { id: 'bb22' }],
    run: { session: expect.any(String) },
  });
  // A General run, in the profile's own folder with the skill linked there.
  const general = join(cli.paths.root, 'sessions', 'general-runs');
  expect(tmux.opened.at(-1)).toMatchObject({ project: '__mesa_general__' });
  expect(existsSync(join(general, '.claude', 'skills', 'cloud-logs'))).toBe(true);

  const prod = await mesa('logs', 'ask', 'what fails most?', '--env', 'prod', '--json');
  expect(prod.code).toBe(10);
  expect(prod.json.error).toMatchObject({
    message:
      'Entries Ask reads are sent to the model: confirm once for tide-tables-123, harbour-web-456 with --allow-prod',
    details: { reason: 'prod_ask', projects: ['tide-tables-123', 'harbour-web-456'] },
  });
  cli.env = { MESA_SESSION_ID: 'agentwin' };
  expect(
    await mesa('logs', 'ask', 'why?', '--env', 'prod', '--allow-prod', '--json'),
  ).toMatchObject({ code: 2 });
  expect(readFileSync(cli.paths.config, 'utf8')).not.toMatch(/prodAsk:\s*\n\s*- tide-tables-123/);
  cli.env = {};
  expect((await mesa('logs', 'ask', 'why?', '--env', 'prod', '--allow-prod', '--json')).code).toBe(
    0,
  );
  expect(readFileSync(cli.paths.config, 'utf8')).toMatch(/prodAsk:\s*\n?\s*- tide-tables-123/);
  expect((await mesa('logs', 'ask', 'why?', '--env', 'prod', '--json')).code).toBe(0);

  const follow = await mesa(
    'logs',
    'ask',
    'and since when?',
    '--env',
    'beta',
    '--conversation',
    beta.json.data.conversation,
    '--json',
  );
  expect(follow.json.data.conversation).toBe(beta.json.data.conversation);
  const asks = (await mesa('logs', 'asks', '--json')).json.data.asks;
  expect(asks[0].turns.map((t: { question: string }) => t.question)).toEqual([
    'what fails most?',
    'and since when?',
  ]);
  expect(asks[0].turns[0].queries.map((q: { project: string }) => q.project)).toEqual([
    'tide-tables-123',
    'harbour-web-456',
  ]);
  expect(asks).toHaveLength(3);
  expect(asks[0].turns[0]).toMatchObject({
    query: { env: 'beta' },
    cited: ['aa11', 'bb22'],
    answer,
  });
});

test("Ask's tools match only reads, and an agent in a Mesa window cannot repoint projects, unmask or confirm prod", async () => {
  const reads = ['logs gcp', 'logs errors', 'logs errors samples', 'logs counts'];
  const prefixes = (readOnlyTools('cloud-logs') ?? []).map(
    (rule) => /^Bash\(mesa (.+):\*\)$/.exec(rule)?.[1] ?? rule,
  );
  expect(prefixes).toHaveLength(3);
  for (const { name } of COMMANDS)
    if (prefixes.some((prefix) => name.startsWith(prefix))) expect(reads).toContain(name);
  await cli.withProject();
  await setUp();
  cli.env = { MESA_SESSION_ID: 'agentwin' };
  expect(await mesa('logs', 'setup', '--project', 'elsewhere-9', '--json')).toMatchObject({
    code: 2,
  });
  expect(await mesa('config', 'set', 'logs.mask', 'false')).toMatchObject({ code: 2 });
  expect(await mesa('config', 'set', 'logs.prodAsk', '["tide-tables-123"]')).toMatchObject({
    code: 2,
  });
  cli.env = {};
  expect(readFileSync(cli.paths.config, 'utf8')).not.toContain('elsewhere-9');
});

test('prod is what an Ask reads: a filter naming prod counts, and only the projects read are confirmed', async () => {
  cli.withTmux({ onOpen: finishesRun({ output: claudeAnswer('ok [aa11]') }) });
  await cli.withProject();
  withGcloud((_, project) => JSON.stringify(project === 'tide-tables-123' ? ENTRIES : WEB));
  await setUp();
  const asked = await mesa(
    'logs',
    'ask',
    'why?',
    '--env',
    'beta',
    '--service',
    'tide-tables-123/tide-api',
    '--filter',
    'resource.labels.namespace_name="prod"',
    '--json',
  );
  expect(asked.code).toBe(10);
  expect(asked.json.error.details).toEqual({ reason: 'prod_ask', projects: ['tide-tables-123'] });
  expect(await mesa('logs', 'ask', 'why?', '--filter', 'a) OR (b', '--json')).toMatchObject({
    code: 2,
  });
});
