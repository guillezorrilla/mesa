// @vitest-environment happy-dom
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import type { CloudFilters } from '@/lib/client/logs';
import { attached, click, envelope, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import type { CloudMode } from '@/lib/workspaceView';
import { CloudLogsScreen } from './CloudLogsScreen';

const now = () => new Date().toISOString();
const entry = (id: string, service: string, fields: Record<string, string> = {}) => ({
  project: service === 'harbour-web' ? 'harbour-web-456' : 'tide-tables-123',
  id,
  time: now(),
  severity: 'ERROR',
  service,
  message: `${service} failed\n  at handler (app.ts:3)`,
  trace: 'projects/tide-tables-123/traces/0f0f9',
  fields,
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
/** The last read of entries (not the service list). */
const lastRead = (calls: string[][]) =>
  calls.filter((argv) => argv[2] === 'gcp' && !argv.includes('--services')).at(-1);
const askButton = () =>
  document.querySelector<HTMLElement>('form button[type="submit"]') ?? undefined;
const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(text));

/** The screen with its view kept as the workspace would keep it. */
function Harness(props: { mode: CloudMode }) {
  const [view, setView] = useState<{ mode: CloudMode; query: CloudFilters; ask?: string }>({
    mode: props.mode,
    query: {},
  });
  return (
    <CloudLogsScreen
      mode={view.mode}
      filters={view.query}
      ask={view.ask}
      onView={setView}
      onSession={() => {}}
    />
  );
}

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

test('Errors lists the groups; a group pages through its occurrences, identical ones as one run; Open all in Explore; Fix asks once which project', async () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  // 50 a page: ten identical lookups, then forty others, then an older page of two.
  const occurrence = (id: string, minutesAgo: number, message: string) => ({
    project: 'tide-tables-123',
    id,
    time: at(minutesAgo),
    severity: 'ERROR',
    service: 'tide-api',
    message,
    trace: null,
    fields: {},
  });
  const page = [
    ...Array.from({ length: 10 }, (_, i) =>
      occurrence(
        `r${i}`,
        i * 0.1,
        `TideTableNotFound: station LC-${i}\n  at tides.load (tides.ts:9)`,
      ),
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      occurrence(
        `o${i}`,
        2 + i,
        i % 2 ? 'TideTableNotFound: no cache' : 'TideTableNotFound: timeout',
      ),
    ),
  ];
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs gcp': (args) =>
      args.includes('--services')
        ? envelope({ env: 'beta', services: [], warnings: [] })
        : envelope({
            projects: GCP.projects,
            env: 'beta',
            envs: ['beta', 'prod'],
            filters: {},
            warnings: [],
            entries: args.some((a) => a.startsWith('--before='))
              ? [
                  occurrence('old1', 300, 'TideTableNotFound: x'),
                  occurrence('old2', 301, 'TideTableNotFound: y'),
                ]
              : page,
          }),
    'logs asks': () => envelope({ asks: [] }),
    'logs errors': () =>
      envelope({
        env: 'beta',
        warnings: [],
        groups: [
          {
            project: 'tide-tables-123',
            id: 'g1',
            message: 'TideTableNotFound: station LC-04',
            sample: '',
            count: 5233,
            firstSeen: twoDaysAgo.toISOString(),
            lastSeen: at(0),
            services: ['tide-api'],
            badge: 'new',
            source: 'error-reporting',
          },
        ],
      }),
    projects: () => envelope([]),
    open: () => envelope({ id: 'sess0001' }),
  });
  function ModeHarness() {
    const [view, setView] = useState<{ mode: CloudMode; query: CloudFilters }>({
      mode: 'errors',
      query: {},
    });
    return (
      <>
        <span data-testid="mode">{view.mode}</span>
        <CloudLogsScreen
          mode={view.mode}
          filters={view.query}
          onView={setView}
          onSession={() => {}}
        />
      </>
    );
  }
  const byTestId = await renderWithMesa(<ModeHarness />, bridge);
  await attached();
  const groups = document.querySelector('[aria-label="Error groups"]');
  expect(groups?.textContent).toContain('x5233');
  expect(groups?.textContent).toContain('New');
  await click(groups?.querySelector<HTMLElement>('button[aria-expanded]') ?? undefined);
  await attached();
  // A day not today shows its date: first seen two days ago reads "Mon D HH:MM".
  const day = twoDaysAgo.toLocaleDateString([], { month: 'short', day: 'numeric' });
  expect(groups?.textContent).toContain(`first ${day}`);
  expect(lastRead(calls)).toEqual(
    expect.arrayContaining([
      '--project=tide-tables-123',
      '--service=tide-tables-123/tide-api',
      '--severity=error',
      '--text=TideTableNotFound: station',
      '--limit=50',
    ]),
  );
  expect(groups?.textContent).toContain('Showing 50 of 5,233');
  expect(groups?.textContent).toMatch(/x10 between/);
  await click(button('Load older'));
  await attached();
  expect(lastRead(calls)?.some((a) => a.startsWith('--before='))).toBe(true);
  expect(groups?.textContent).toContain('Showing 52 of 5,233');
  await click(button('Fix in session'));
  expect(document.querySelector('[data-testid="cloud-project-dialog"]')).not.toBeNull();
  await click(
    document.querySelector<HTMLElement>(
      '[data-testid="cloud-project-dialog"] button[type="button"]',
    ) ?? undefined,
  );
  await click(button('Open all in Explore'));
  expect(byTestId('mode')[0]?.textContent).toBe('explore');
});

test('Explore: a facet chip and a trace id each become a filter; Load older reads the next page', async () => {
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
            entries: [
              entry('a1', 'tide-api', { company: 'Lantern Cove' }),
              entry('b2', 'harbour-web', { company: 'Lantern Cove' }),
            ],
          }),
  });
  await renderWithMesa(<Harness mode="explore" />, bridge);
  await attached();
  expect(document.querySelectorAll('[aria-label="Log entries"] li')).toHaveLength(2);
  await click(
    [...document.querySelectorAll<HTMLElement>('fieldset button')].find((b) =>
      b.textContent?.includes('company = Lantern Cove'),
    ),
  );
  await attached();
  expect(lastRead(calls)).toContain('--field=company=Lantern Cove');
  await click(document.querySelector<HTMLElement>('button[title^="Show trace"]') ?? undefined);
  await attached();
  expect(lastRead(calls)).toContain('--trace=0f0f9');
  await click(button('Load older'));
  await attached();
  expect(lastRead(calls)?.some((a) => a.startsWith('--before='))).toBe(true);
});

test('Ask keeps a conversation; prod asks once first; a query can be saved as a view', async () => {
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  const turn = {
    at: now(),
    question: 'what fails?',
    query: {},
    answer: 'Lookups fail [a1].',
    cited: ['a1'],
    queries: [{ project: 'tide-tables-123', filter: 'severity>=ERROR' }],
    session: 'run1',
  };
  let asked = false;
  const { bridge, calls } = fakeBridge({
    config: () => config(GCP),
    'logs gcp': () => envelope({ env: 'prod', services: [], warnings: [] }),
    'logs asks': () => envelope({ asks: asked ? [{ id: 'run1', turns: [turn] }] : [] }),
    'logs ask': (args) => {
      if (args.includes('--env=prod') && !args.includes('--allow-prod'))
        return {
          ok: false,
          error: { code: 'needs_approval', message: 'confirm', details: { reason: 'prod_ask' } },
        };
      asked = true;
      return envelope({
        conversation: 'run1',
        projects: GCP.projects,
        env: 'prod',
        filters: {},
        entries: [],
        warnings: [],
        answer: turn.answer,
        cited: ['a1'],
        queries: turn.queries,
        run: { session: 'run1', durationMs: 1 },
      });
    },
    'config set': () => envelope({ path: 'logs.views', value: [] }),
  });
  function ProdHarness() {
    const [view, setView] = useState<{ mode: CloudMode; query: CloudFilters; ask?: string }>({
      mode: 'ask',
      query: { env: 'prod' },
    });
    return (
      <CloudLogsScreen
        mode={view.mode}
        filters={view.query}
        ask={view.ask}
        onView={setView}
        onSession={() => {}}
      />
    );
  }
  await renderWithMesa(<ProdHarness />, bridge);
  await attached();
  await fill(
    document.querySelector<HTMLTextAreaElement>('[aria-label="Question about the logs"]'),
    'what fails?',
  );
  await click(askButton());
  await attached();
  expect(document.querySelector('[data-testid="prod-ask-dialog"]')).not.toBeNull();
  await click(document.querySelector<HTMLElement>('[data-testid="confirm-prod-ask"]') ?? undefined);
  await attached();
  expect(calls.some((argv) => argv[2] === 'ask' && argv.includes('--allow-prod'))).toBe(true);
  expect(document.querySelector('[aria-label="Ask the logs"]')?.textContent).toContain(
    'Lookups fail',
  );
  await click(document.querySelector<HTMLElement>('details summary') ?? undefined);
  await click(button('Save as view'));
  await fill(document.querySelector<HTMLInputElement>('[aria-label="View name"]'), 'tide errors');
  await click(
    document.querySelector<HTMLElement>('[data-testid="confirm-save-view"]') ?? undefined,
  );
  await attached();
  const set = calls.find((argv) => argv[1] === 'config' && argv[2] === 'set');
  expect(set?.at(-1)).toContain('"filter":"severity>=ERROR"');
  expect(set?.at(-1)).toContain('"name":"tide errors"');
});
