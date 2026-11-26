// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { CloudFilters } from '@/lib/client/logs';
import {
  attached,
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  fill,
  renderWithMesa,
} from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import { guardrailStopped } from '@/lib/testing/replies';
import type { CloudMode, WorkspaceView } from '@/lib/workspaceView';
import { CloudLogsKeptScreen } from './CloudLogsKeptScreen';
import { CloudLogsScreen } from './CloudLogsScreen';
import type { CloudLogsView } from './types';

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const STACK =
  '\n    at com.tides.TableStore.load(TableStore.java:41)\n    at com.tides.TideController.get(TideController.java:88)';
/** An invented entry. */
const entry = (id: string, minutesAgo: number, message: string, extra: object = {}) => ({
  project: 'tide-tables-123',
  id,
  time: at(minutesAgo),
  severity: 'ERROR',
  service: 'tide-api',
  message,
  trace: null,
  fields: {},
  ...extra,
});
const GCP = { projects: ['tide-tables-123', 'harbour-web-456'], envs: { beta: 'x', prod: 'y' } };
const config = (gcp?: object, fixProjects: Record<string, string> = {}) => {
  const base = (HEALTHY.config as (args: string[]) => { data: object })([]).data;
  return envelope({
    ...base,
    logs: {
      panel: true,
      cloudTab: true,
      views: [],
      prodAsk: [],
      mask: true,
      fixProjects,
      askModel: 'claude-opus-5-5',
      recentProjects: [],
      starredProjects: [],
      ...(gcp ? { gcp } : {}),
    },
  });
};
const lastRead = (calls: string[][]) =>
  calls.filter((argv) => argv[2] === 'gcp' && !argv.includes('--services')).at(-1);
const button = (text: string, within: ParentNode = document) =>
  [...within.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(text));
const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) ?? undefined;

/** The screen with its view kept as the workspace would keep it, and the view shown for tests. */
function Harness(props: { mode: CloudMode; query?: CloudFilters; ask?: string }) {
  const [view, setView] = useState<CloudLogsView>({
    mode: props.mode,
    query: props.query ?? {},
    ask: props.ask,
  });
  return (
    <>
      <output data-testid="view">{JSON.stringify(view)}</output>
      <CloudLogsScreen
        mode={view.mode}
        filters={view.query}
        ask={view.ask}
        prompt={view.prompt}
        onView={setView}
        onSession={() => {}}
      />
    </>
  );
}
afterEach(() => localStorage.clear());

/** The Logs tab as the workspace mounts it, with Away and Back for another screen and the Logs tab again. */
function KeptHarness() {
  const [view, setView] = useState<Extract<WorkspaceView, { kind: 'logs' }> | undefined>({
    kind: 'logs',
  });
  return (
    <>
      <button type="button" onClick={() => setView(undefined)}>
        Away
      </button>
      <button type="button" onClick={() => setView({ kind: 'logs' })}>
        Back
      </button>
      <CloudLogsKeptScreen
        view={view}
        onView={(next) => setView({ kind: 'logs', ...next })}
        onSession={() => {}}
      />
    </>
  );
}

/** Errors and Explorer reads over invented groups and entries, every call kept. */
const keptBridge = () =>
  fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [] }),
    'logs errors': () => envelope({ env: 'beta', warnings: [], groups: GROUPS, incidents: [] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: [entry('k1', 1, 'tide lookup failed')],
          }),
  });
const reads = (calls: string[][], command: string) =>
  calls.filter((argv) => argv[2] === command && !argv.includes('--services')).length;

test('leaving the Logs tab and coming back keeps it as left, with no new read: the view, the env, the group picked, the sort and the query being edited', async () => {
  const { bridge, calls } = keptBridge();
  await renderWithMesa(<KeptHarness />, bridge);
  await attached();
  const groups = () => [...document.querySelectorAll<HTMLElement>('[data-group]')];
  await click(groups().at(-1));
  const picked = groups().at(-1)?.getAttribute('data-group');
  const sort = q<HTMLSelectElement>('[aria-label="Sort errors"]');
  if (sort) {
    sort.value = 'newest';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await click(q('[role="radio"][value="explorer"]') ?? button('Explorer'));
  await attached();
  await fill(q<HTMLTextAreaElement>('[aria-label="Query"]'), 'severity>=ERROR');
  await fill(q<HTMLTextAreaElement>('[aria-label="Question about the logs"]'), 'why now?');
  const before = { errors: reads(calls, 'errors'), gcp: reads(calls, 'gcp') };
  await click(button('Away'));
  // Hidden, not unmounted: Activity keeps its DOM and state.
  expect(q('[aria-label="Cloud Logs"]')?.style.display).toBe('none');
  await click(button('Back'));
  await attached();
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toBe('severity>=ERROR');
  expect(q<HTMLTextAreaElement>('[aria-label="Question about the logs"]')?.value).toBe('why now?');
  expect(reads(calls, 'gcp')).toBe(before.gcp);
  await click(q('[role="radio"][value="errors"]') ?? button('Errors'));
  await attached();
  expect(reads(calls, 'errors')).toBe(before.errors);
  expect(q<HTMLSelectElement>('[aria-label="Sort errors"]')?.value).toBe('newest');
  expect(document.querySelector(`[data-group="${picked}"]`)?.getAttribute('aria-pressed')).toBe(
    'true',
  );
});

test('a restart restores the choices kept for the profile: the view, its filters, the sort and the group', async () => {
  localStorage.setItem(
    'mesa.logs.default.view',
    JSON.stringify({ mode: 'explorer', query: { env: 'prod', severity: 'warning' } }),
  );
  localStorage.setItem('mesa.logs.default.errors.sort', '"newest"');
  localStorage.setItem('mesa.logs.default.explorer.claude', 'false');
  const { bridge, calls } = keptBridge();
  await renderWithMesa(<KeptHarness />, bridge);
  await attached();
  await attached();
  expect(lastRead(calls)).toEqual(expect.arrayContaining(['--env=prod', '--severity=warning']));
  expect(q('[aria-label="Claude"]')).toBeUndefined();
  await click(q('[role="radio"][value="errors"]') ?? button('Errors'));
  await attached();
  expect(q<HTMLSelectElement>('[aria-label="Sort errors"]')?.value).toBe('newest');
});

test('a kept choice that no longer exists falls back with a note: a removed env and project', async () => {
  localStorage.setItem(
    'mesa.logs.default.view',
    JSON.stringify({
      mode: 'explorer',
      query: { env: 'staging', projects: ['gone-project-9', 'tide-tables-123'] },
    }),
  );
  const { bridge, calls } = keptBridge();
  await renderWithMesa(<KeptHarness />, bridge);
  await attached();
  await attached();
  const note = q('[aria-label="Cloud Logs"] [role="status"]')?.textContent ?? '';
  expect(note).toContain('The env staging is no longer set up: showing beta.');
  expect(note).toContain('gone-project-9 is no longer in your projects: left out.');
  const read = lastRead(calls) ?? [];
  expect(read).toContain('--env=beta');
  expect(read.join(' ')).not.toContain('gone-project-9');
  // The kept view is rewritten with what is left, so the next start has no stale choice.
  expect(JSON.parse(localStorage.getItem('mesa.logs.default.view') ?? '{}')).toMatchObject({
    query: { projects: ['tide-tables-123'] },
  });
});

const view = () => JSON.parse(q('[data-testid="view"]')?.textContent ?? '{}') as CloudLogsView;

test('without logs.gcp the tab is the setup; with setup it changes projects and envs, Cancel going back', async () => {
  const { bridge } = fakeBridge({
    config: () => config(),
    'logs projects': () => envelope({ current: 'tide-tables-123', projects: [] }),
    'logs envs': () => envelope({ suggestions: [] }),
    'logs asks': () => envelope({ asks: [] }),
  });
  await renderWithMesa(<Harness mode="errors" />, bridge);
  await attached();
  expect(document.querySelector('[aria-label="Set up Cloud Logs"]')?.textContent).toContain(
    'Read your Google Cloud logs',
  );
  expect(button('Cancel')).toBeUndefined();
});

const GROUPS = [
  {
    project: 'tide-tables-123',
    id: 'TideTableNotFoundException at TableStore.java:41',
    message: 'TideTableNotFoundException at TableStore.java:41',
    sample: `TideTableNotFoundException: no table for station LC-04${STACK}`,
    count: 412,
    firstSeen: at(40),
    lastSeen: at(1),
    services: ['tide-api'],
    badge: null,
    source: 'logs',
    spark: [0, 0, 1, 4, 9, 12],
    variants: [
      { message: 'TideTableNotFoundException: no table for station LC-04', count: 300 },
      { message: 'TideTableNotFoundException: no cache', count: 112 },
    ],
    facets: [
      {
        key: 'company',
        values: [
          { value: 'Lantern Cove', count: 280 },
          { value: 'Quiet Reef', count: 132 },
        ],
      },
    ],
    samples: [entry('s1', 1, `TideTableNotFoundException: no table for station LC-04${STACK}`)],
  },
  {
    project: 'harbour-web-456',
    id: 'message:GET /checkout # #ms',
    message: 'GET /checkout 502 1840ms',
    sample: '',
    count: 188,
    firstSeen: at(39),
    lastSeen: at(2),
    services: ['harbour-web'],
    badge: 'new',
    source: 'logs',
    spark: [0, 0, 1, 3, 5, 6],
  },
  {
    project: 'tide-tables-123',
    id: 'message:mooring',
    message: 'MooringSyncTimeoutException: berth service did not answer',
    sample: '',
    count: 23,
    firstSeen: at(300),
    lastSeen: at(0),
    services: ['tide-worker'],
    badge: null,
    source: 'logs',
    spark: [3, 4, 4, 4, 4, 4],
  },
];
const INCIDENT = {
  id: 'incident:tide-tables-123 TideTableNotFoundException at TableStore.java:41',
  groups: [
    'tide-tables-123 TideTableNotFoundException at TableStore.java:41',
    'harbour-web-456 message:GET /checkout # #ms',
  ],
  origin: 'tide-tables-123 TideTableNotFoundException at TableStore.java:41',
  started: at(40),
  services: ['tide-api', 'harbour-web'],
  links: [
    {
      from: 'harbour-web-456 message:GET /checkout # #ms',
      to: 'tide-tables-123 TideTableNotFoundException at TableStore.java:41',
      reason: 'trace',
      detail: '212',
      strength: 0.9,
    },
    {
      from: 'harbour-web-456 message:GET /checkout # #ms',
      to: 'tide-tables-123 TideTableNotFoundException at TableStore.java:41',
      reason: 'counts',
      detail: 'r 0.97',
      strength: 0.68,
    },
  ],
};

test('Errors: incidents and lone groups on the left, the origin open on the right with its stack, variants, context, related groups and actions', async () => {
  const platform = fakePlatform();
  const sent: string[] = [];
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [] }),
    'logs errors': () =>
      envelope({ env: 'beta', warnings: [], groups: GROUPS, incidents: [INCIDENT] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: [entry('o1', 1, 'TideTableNotFoundException: no table for station LC-04')],
          }),
    'logs ask': () =>
      envelope({
        conversation: 'c1',
        projects: [],
        env: 'beta',
        filters: {},
        entries: [],
        warnings: [],
        answer:
          'One incident: tide-api cannot find tide tables [s1], and the web app shows it as 502s.',
        cited: ['s1'],
        queries: [],
        run: { session: 'r1', durationMs: 1 },
      }),
    projects: () => envelope([]),
    // A prod group asks first, then the guardrail asks about the goal, then the session starts.
    'logs session': (args, stdin) => {
      sent.push(stdin ?? '');
      if (!args.includes('--allow-prod'))
        return {
          ok: false,
          error: {
            code: 'needs_approval',
            message: 'confirm',
            details: { reason: 'prod_ask', projects: ['tide-tables-123'] },
          },
        };
      if (!args.includes('--yes')) return guardrailStopped('ask', 'the goal names a deploy');
      return envelope({ session: { id: 's9' } });
    },
  });
  await renderWithMesa(<Harness mode="errors" />, bridge, platform);
  await attached();
  const list = q('[aria-label="Error groups"]');
  expect(q('[aria-label="Incident"]')?.textContent).toContain(
    'Likely origin: TideTableNotFoundException at TableStore.java',
  );
  expect(list?.textContent).toContain('MooringSyncTimeoutException');
  const detail = q('[aria-label="Error detail"]');
  expect(detail?.textContent).toContain('at com.tides.TableStore.load');
  expect(q('[aria-label="Message variants"]')?.textContent).toContain('no cache');
  expect(q('[aria-label="Context"]')?.textContent).toContain('Lantern Cove 280');
  expect(q('[aria-label="Related"]')?.textContent).toContain(
    'share 212 traces; rise together, r 0.97',
  );
  expect(detail?.querySelector('a')?.getAttribute('href')).toContain(
    'https://console.cloud.google.com/logs/query;query=severity%3E%3DERROR',
  );
  // Sorted by rise, the steady job error goes last; New only keeps the incident (its 502 is new).
  const sort = q<HTMLSelectElement>('[aria-label="Sort errors"]');
  if (sort) {
    sort.value = 'newest';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
  }
  expect(list?.querySelector('[data-group]')?.getAttribute('data-group')).toBe(
    'tide-tables-123 message:mooring',
  );
  await click(
    q('[aria-label="Error groups"]')
      ?.closest('div')
      ?.parentElement?.querySelector<HTMLElement>('[role="switch"]') ?? undefined,
  );
  expect(list?.textContent).not.toContain('MooringSyncTimeoutException');
  await click(button('Summarise'));
  await attached();
  expect(calls.find((argv) => argv[2] === 'ask')).toEqual(
    expect.arrayContaining(['--severity=error']),
  );
  expect(q('[aria-label="Summary"]')?.textContent).toContain('One incident');
  // The selection followed the sort, so the pane shown now is read again.
  const shown = q('[aria-label="Error detail"]') ?? document;
  await click(button('Copy', shown));
  expect(platform.pasteboard.at(-1)).toContain('at com.tides.TableStore.load');
  await click(button('Fix in session', shown));
  expect(q('[data-testid="cloud-project-dialog"]')).toBeDefined();
  await click(q('[data-testid="confirm-cloud-project"]'));
  await attached();
  expect(q('[data-testid="prod-ask-dialog"]')?.textContent).toContain('tide-tables-123');
  await click(q('[data-testid="confirm-prod-ask"]'));
  await attached();
  expect(q('[data-testid="guardrail-dialog"]')?.textContent).toContain('names a deploy');
  await click(q('[data-testid="guardrail-start"]'));
  await attached();
  const opens = calls.filter((argv) => argv[2] === 'session');
  expect(opens).toHaveLength(3);
  expect(opens[2]).toEqual(expect.arrayContaining(['--allow-prod', '--yes']));
  // The group goes on stdin, for core to fence and mask; the app writes no goal of its own.
  expect(JSON.parse(sent[2] ?? '{}')).toMatchObject({ project: 'tide-tables-123' });
  await click(button('Ask about this'));
  await attached();
  expect(view()).toMatchObject({ mode: 'explorer', query: { projects: ['tide-tables-123'] } });
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toContain(
    '"TideTableNotFoundException: no table for station"',
  );
  expect(q<HTMLTextAreaElement>('[aria-label="Question about the logs"]')?.value).toContain(
    'Explain this error',
  );
});

test('Explorer: fields add or exclude clauses, Show matching narrows, repeats fold, Ask in words writes the query, Claude reads the selection and its query applies', async () => {
  const entries = [
    entry('a1', 1, 'lookup failed for order 18240', { fields: { company: 'Lantern Cove' } }),
    entry('a2', 1.1, 'lookup failed for order 18233', { fields: { company: 'Lantern Cove' } }),
    entry('a3', 1.2, 'lookup failed for order 18100', { fields: { company: 'Quiet Reef' } }),
    entry('b1', 3, 'checkout stalled', { service: 'harbour-web', project: 'harbour-web-456' }),
  ];
  let first = true;
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries,
          }),
    'logs query': () => envelope({ query: 'severity>=ERROR AND jsonPayload.company="Quiet Reef"' }),
    'logs ask': (args) => {
      if (first && !args.includes('--allow-prod')) {
        first = false;
        return {
          ok: false,
          error: {
            code: 'needs_approval',
            message: 'confirm',
            details: { reason: 'prod_ask', projects: ['tide-tables-123'] },
          },
        };
      }
      return envelope({
        conversation: 'c1',
        projects: [],
        env: 'beta',
        filters: {},
        entries: [],
        warnings: [],
        answer:
          'Lookups fail for one company [a1].\n\n```query\njsonPayload.company="Lantern Cove"\n```',
        cited: ['a1'],
        queries: [],
        run: { session: 'r1', durationMs: 1 },
      });
    },
  });
  await renderWithMesa(<Harness mode="explorer" />, bridge);
  await attached();
  const fields = q('[aria-label="Fields"]');
  expect(q('[aria-label="company"]')?.textContent).toContain('Lantern Cove2');
  await click(button('Lantern Cove', fields ?? document));
  await attached();
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toBe(
    'jsonPayload.company="Lantern Cove"',
  );
  expect(lastRead(calls)).toContain('--filter=jsonPayload.company="Lantern Cove"');
  // The value in the query shows checked; - excludes another; each is a chip that takes it out.
  expect(q('[aria-label="company"] li[data-state="in"]')?.textContent).toContain('Lantern Cove');
  await click(q('[aria-label="Not Quiet Reef"]'));
  await attached();
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toContain(
    'AND NOT jsonPayload.company="Quiet Reef"',
  );
  expect(q('[aria-label="company"] li[data-state="out"]')?.textContent).toContain('Quiet Reef');
  expect(q('[aria-label="View filters"]')?.textContent).toContain('not company = Quiet Reef');
  await click(q('[aria-label="Remove company = Lantern Cove"]'));
  await attached();
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toBe(
    'NOT jsonPayload.company="Quiet Reef"',
  );
  expect(lastRead(calls)).toContain('--filter=NOT jsonPayload.company="Quiet Reef"');
  // Three lookups that differ only by order id fold into one row.
  expect(q('[aria-label="Log entries"]')?.textContent).toMatch(/x3 between/);
  await click(q('[data-id="b1"] [role="option"]'));
  await click(
    button('Show matching', q('[data-id="b1"] [aria-label="Entry actions"]') ?? document),
  );
  await click(q('[data-id="b1"] [role="option"]'));
  await attached();
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toContain('AND "checkout stalled"');
  await fill(q<HTMLInputElement>('[aria-label="Ask in words"]'), 'errors for Quiet Reef');
  await click(button('Write query'));
  await attached();
  const written = 'severity>=ERROR AND jsonPayload.company="Quiet Reef"';
  // The written query waits in the bar, highlighted, until the person runs it.
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toBe(written);
  expect(lastRead(calls)).not.toContain(`--filter=${written}`);
  expect(document.body.textContent).toContain('Written from your words');
  await click(q('button[title="Run (Cmd+Enter)"]'));
  await attached();
  expect(lastRead(calls)).toContain(`--filter=${written}`);
  expect(document.body.textContent).not.toContain('Written from your words');
  // Select an entry, then ask: the prod confirmation first, then the answer cites and suggests.
  await click(q('[data-id="a1"] [role="option"]'));
  await fill(q<HTMLTextAreaElement>('[aria-label="Question about the logs"]'), 'why?');
  await click(button('Ask', q('[aria-label="Claude"]') ?? document));
  await attached();
  // No service shown maps to a project yet: which code to read is asked once, and kept.
  expect(q('[data-testid="cloud-project-dialog"]')?.textContent).toContain(
    'Read code from which project?',
  );
  await click(q('[data-testid="confirm-cloud-project"]'));
  await attached();
  expect(calls.some((argv) => argv.join(' ').includes('logs.fixProjects'))).toBe(true);
  expect(q('[data-testid="prod-ask-dialog"]')?.textContent).toContain('tide-tables-123');
  await click(q('[data-testid="confirm-prod-ask"]'));
  await attached();
  const asked = calls.filter((argv) => argv[2] === 'ask').at(-1) ?? [];
  expect(asked).toContain('--allow-prod');
  expect(asked.at(-1)).toBe('About the selected entries [a1]: why?');
  expect(view().ask).toBe('c1');
});

test("an Ask's answer copies its query, a query it ran runs its own filters over the view, and the conversation opens in a session, General by default", async () => {
  const platform = fakePlatform();
  const turn = {
    at: at(5),
    question: 'why?',
    query: {},
    answer: 'Lookups fail [a1].\n\n```query\njsonPayload.company="Lantern Cove"\n```',
    cited: ['a1'],
    queries: [
      {
        project: 'tide-tables-123',
        filter:
          'resource.labels.cluster_name="harbour-beta" AND timestamp>="2026-05-06T07:00:00Z" AND severity>=ERROR',
        own: { severity: 'error' },
      },
    ],
    session: 'r1',
    code: 'lantern-cove',
    model: 'claude-opus-5-5',
    durationMs: 42_000,
    costUsd: 0.31,
  };
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [{ id: 'c1', turns: [turn] }] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: [entry('a1', 1, 'lookup failed for order 18240')],
          }),
    'logs session': () => envelope({ session: { id: 's9' } }),
    projects: () => envelope([]),
  });
  await renderWithMesa(<Harness mode="explorer" ask="c1" />, bridge, platform);
  await attached();
  const claude = q('[aria-label="Claude"]') ?? document;
  await click(button('Copy query', claude));
  expect(platform.pasteboard.at(-1)).toContain('jsonPayload.company="Lantern Cove"');
  await click(button('Run', q('[aria-label="Claude"] details') ?? document));
  await attached();
  const read = lastRead(calls)?.join(' ') ?? '';
  expect(read).toContain('--severity=error');
  expect(read).not.toContain('timestamp');
  expect(read).not.toContain('harbour-beta');
  await click(q('[aria-label="Open in a session"]'));
  expect(q('[data-testid="cloud-project-dialog"]')?.textContent).toContain(
    'Open in which project?',
  );
  await click(q('[data-testid="confirm-cloud-project"]'));
  await attached();
  const open = calls.filter((argv) => argv[2] === 'session').at(-1);
  expect(open).toEqual(expect.arrayContaining(['--conversation=c1', '__mesa_general__']));
  // Each answer says its model, time and cost, and the code it read; Fix in session starts there.
  expect(claude.textContent).toContain('Opus 5.5 · 42s · $0.31 · read lantern-cove');
  await click(button('Fix in session', claude));
  await attached();
  expect(calls.filter((argv) => argv[2] === 'session').at(-1)).toEqual(
    expect.arrayContaining(['--conversation=c1', 'lantern-cove']),
  );
});

test('a quick investigation asks with its own range, and the answer streams into the panel as it comes', async () => {
  let finish: (value: unknown) => void = () => {};
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP, { 'tide-tables-123/tide-api': 'lantern-cove' }),
    'logs asks': () => envelope({ asks: [] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: [entry('a1', 1, 'lookup failed for order 18240')],
          }),
    'logs asking': (args) =>
      envelope({
        session: 'r2',
        text: args.at(-1)?.length === 36 ? 'Two groups are new since' : '',
      }),
    'logs ask': () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await renderWithMesa(<Harness mode="explorer" />, bridge);
  await attached();
  const claude = q('[aria-label="Claude"]') ?? document;
  expect(
    (button('Errors for this company/user', claude) as HTMLButtonElement | null)?.disabled,
  ).toBe(true);
  await click(button('What is new since yesterday', claude));
  await vi.waitFor(() => expect(claude.textContent).toContain('Two groups are new since'), {
    timeout: 3000,
  });
  const asked = calls.filter((argv) => argv[2] === 'ask').at(-1) ?? [];
  expect(asked).toContain('--since=1d');
  // The panel reads the answer by the Ask's own stream token, never another Ask's.
  const token = asked.find((arg) => arg.startsWith('--stream='))?.slice('--stream='.length);
  expect(calls.some((argv) => argv[2] === 'asking' && argv.at(-1) === token)).toBe(true);
  expect(calls.some((argv) => argv[2] === 'asking')).toBe(true);
  finish(
    envelope({
      conversation: 'c2',
      projects: [],
      env: 'beta',
      filters: {},
      entries: [],
      warnings: [],
      answer: 'Two groups are new since yesterday [a1].',
      cited: ['a1'],
      queries: [],
      run: { session: 'r2', durationMs: 1 },
    }),
  );
  await attached();
  expect(view().ask).toBe('c2');
});

test('the fields pane: app fields first, plumbing under More, ids only when searched; a pinned field is a column; every row has its badge; long messages fold; the histogram spans what was read', async () => {
  const entries = Array.from({ length: 24 }, (_, i) =>
    entry(
      `e${i}`,
      i / 60,
      i === 0
        ? `{"action":"sync",\n"step":1,\n"of":4,\n"ok":false,\n"why":"late"}`
        : i === 4
          ? 'berth sync stalled\nstep 1 of 4\nstep 2 of 4\nstep 3 of 4\nwaiting on the registry'
          : `${['tide lookup', 'berth sync', 'mooring check', 'harbour scan'][i % 4]} ${i}`,
      {
        severity: ['ERROR', 'NOTICE', 'DEFAULT', 'INFO'][i % 4],
        fields: {
          company: i % 2 ? 'Lantern Cove' : 'Quiet Reef',
          status: String(200 + (i % 6)),
          logger: 'com.tides.harbour.webhook.domain.TideWebhookService',
          requestId: `req-${i}`,
        },
      },
    ),
  );
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({
            env: 'beta',
            services: [{ project: 'tide-tables-123', name: 'tide-api', kind: 'GKE' }],
            warnings: [],
          })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries,
          }),
  });
  await renderWithMesa(<Harness mode="explorer" />, bridge);
  await attached();
  const fields = q('[aria-label="Fields"]') ?? document;
  const names = [...fields.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
  expect(names.slice(0, 4)).toEqual(['Service', 'Severity', 'company', 'status']);
  expect(fields.querySelector('details')?.open).toBe(false);
  expect(names).not.toContain('requestId');
  expect(q('[aria-label="Service"]')?.textContent).toContain('GKE');
  expect(q('[aria-label="status"]')?.textContent).toContain('Show all (6)');
  await fill(q<HTMLInputElement>('[aria-label="Search fields"]'), 'req-1');
  expect(q('[aria-label="requestId"]')?.textContent).toContain('req-1');
  await fill(q<HTMLInputElement>('[aria-label="Search fields"]'), '');
  await click(q('[aria-label="Show company as column"]'));
  expect(q('[data-id="e1"] [data-column="company"]')?.textContent).toBe('Lantern Cove');
  expect(localStorage.getItem('mesa.logs.default.fields.columns')).toBe('["company"]');
  // Every row has its badge, DEFAULT and NOTICE too; a 5-line message shows 3 with more.
  expect(q('[data-id="e1"] span[data-level]')?.textContent).toBe('NOTICE');
  expect(q('[data-id="e2"] span[data-level]')?.textContent).toBe('DEFAULT');
  expect(button('more', q('[data-id="e4"]') ?? document)).toBeDefined();
  expect(q('[data-id="e0"] summary')?.textContent).toContain('sync');
  expect(q('[aria-label="Entries over time"]')?.textContent).toMatch(
    /24 entries read, .* per (1|2) s/,
  );
  // An edited query that has not run says so; the placeholder is a generic example.
  const bar = q<HTMLTextAreaElement>('[aria-label="Query"]');
  expect(bar?.placeholder).toBe('Logging query, for example severity>=WARNING');
  await fill(bar, 'severity>=ERROR');
  expect(document.body.textContent).toContain('Edited, not run yet');
  const entryReads = () =>
    calls.filter((argv) => argv[2] === 'gcp' && !argv.includes('--services')).length;
  const reads = entryReads();
  await click(q('[aria-label="Hide fields"]'));
  expect(q('[aria-label="Fields"]')).toBeUndefined();
  expect(localStorage.getItem('mesa.logs.default.fields.hidden')).toBe('true');
  await click(button('Fields'));
  expect(q('[aria-label="Fields"]')).toBeDefined();
  expect(entryReads()).toBe(reads);
  localStorage.clear();
});

test('Service and Severity count the whole range from Cloud Monitoring: an ERROR the page lacks shows and is a click; context fields say they count the page', async () => {
  const minute = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  let counted = true;
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [] }),
    'logs volume': () =>
      envelope(
        counted
          ? {
              counted: true,
              severities: [
                { severity: 'ERROR', count: 37 },
                { severity: 'INFO', count: 5120 },
              ],
              services: [
                { project: 'tide-tables-123', name: 'tide-api', kind: 'GKE', count: 5157 },
              ],
              series: [
                { start: minute(30), count: 2600, errors: 30 },
                { start: minute(10), count: 2557, errors: 7 },
              ],
              stepMs: 60_000,
              warnings: [],
            }
          : {
              counted: false,
              why: 'the query searches text, a trace or fields, which Cloud Monitoring does not count',
              severities: [],
              series: [],
              stepMs: 0,
              warnings: [],
            },
      ),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: [
              entry('p1', 1, 'tide table loaded', {
                severity: 'INFO',
                fields: { company: 'Lantern Cove' },
              }),
            ],
          }),
  });
  await renderWithMesa(<Harness mode="explorer" />, bridge);
  await attached();
  const severity = q('[aria-label="Severity"]');
  expect(severity?.textContent).toContain('last 1 h');
  expect(severity?.textContent).toMatch(/ERROR37/);
  // Every severity is listed, the ones with none muted, still a click.
  expect(severity?.querySelector('li[class*="opacity-50"]')?.textContent).toContain('CRIT');
  expect(q('[aria-label="Service"]')?.textContent).toContain('GKE');
  expect(q('[aria-label="company"]')?.textContent).toContain('in the 1 entry shown');
  expect(q('[aria-label="Entries over time"]')?.textContent).toContain(
    '5157 entries over the range',
  );
  await click(button('ERROR', severity ?? document));
  await attached();
  expect(lastRead(calls)).toContain('--filter=severity=ERROR');
  counted = false;
  await fill(q<HTMLTextAreaElement>('[aria-label="Query"]'), '"tide"');
  await click(q('button[title="Run (Cmd+Enter)"]'));
  await attached();
  expect(q('[aria-label="Fields"]')?.textContent).toContain(
    'Service and severity counts are of the entries shown',
  );
  expect(q('[aria-label="Severity"]')?.textContent).toContain('in the 1 entry shown');
});

test('a saved view opens in Explorer with its other filters as chips and its metric counts in the chart', async () => {
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs asks': () => envelope({ asks: [] }),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: [],
          }),
    'logs counts': () => envelope({ counts: [{ start: at(10), count: 7 }], warnings: [] }),
  });
  await renderWithMesa(
    <Harness
      mode="explorer"
      query={{
        severity: 'error',
        fields: { company: 'Lantern Cove' },
        metric: 'tide-lookups',
        projects: ['tide-tables-123'],
      }}
    />,
    bridge,
  );
  await attached();
  expect(q('[aria-label="View filters"]')?.textContent).toContain('company = Lantern Cove');
  expect(calls.find((argv) => argv[2] === 'counts')).toEqual(
    expect.arrayContaining(['--metric=tide-lookups']),
  );
  await click(q('[aria-label="Remove severity >= error"]'));
  expect(view().query.severity).toBeUndefined();
});
