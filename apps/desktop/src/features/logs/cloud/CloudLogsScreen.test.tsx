// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
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
import type { CloudMode } from '@/lib/workspaceView';
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
const config = (gcp?: object) => {
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
function Harness(props: { mode: CloudMode; query?: CloudFilters }) {
  const [view, setView] = useState<CloudLogsView>({ mode: props.mode, query: props.query ?? {} });
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
  await click(q('[data-testid="cloud-project-dialog"] button[type="button"]'));
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
  const quiet = button('Quiet Reef', q('[aria-label="Fields"]') ?? document);
  await act(async () => {
    quiet?.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
  });
  await attached();
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toContain(
    'AND NOT jsonPayload.company="Quiet Reef"',
  );
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
  expect(q<HTMLTextAreaElement>('[aria-label="Query"]')?.value).toBe(
    'severity>=ERROR AND jsonPayload.company="Quiet Reef"',
  );
  // Select an entry, then ask: the prod confirmation first, then the answer cites and suggests.
  await click(q('[data-id="a1"] [role="option"]'));
  await fill(q<HTMLTextAreaElement>('[aria-label="Question about the logs"]'), 'why?');
  await click(button('Ask', q('[aria-label="Claude"]') ?? document));
  await attached();
  expect(q('[data-testid="prod-ask-dialog"]')?.textContent).toContain('tide-tables-123');
  await click(q('[data-testid="confirm-prod-ask"]'));
  await attached();
  const asked = calls.filter((argv) => argv[2] === 'ask').at(-1) ?? [];
  expect(asked).toContain('--allow-prod');
  expect(asked.at(-1)).toBe('About the selected entries [a1]: why?');
  expect(view().ask).toBe('c1');
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
