// @vitest-environment happy-dom
import { useState } from 'react';
import { expect, test } from 'vitest';
import type { CloudFilters } from '@/lib/client/logs';
import {
  attached,
  click,
  envelope,
  fakeBridge,
  fill,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { HEALTHY } from '@/lib/testing/healthy';
import type { CloudMode } from '@/lib/workspaceView';
import { CloudLogsScreen } from '../CloudLogsScreen';
import { CloudEnvsDialog } from './CloudEnvsDialog';

const GCP = {
  projects: ['tide-tables-123'],
  envs: {
    beta: 'resource.labels.cluster_name="harbour-beta"',
    prod: 'resource.labels.cluster_name="harbour-prod"',
  },
};
/** Invented projects in an invented organization and folder. */
const LISTED = {
  current: 'tide-tables-123',
  projects: [
    { id: 'tide-tables-123', name: 'Tide tables', parent: 'organizations/11' },
    { id: 'harbour-web-456', name: 'Harbour web', parent: 'folders/22' },
    { id: 'quay-ops-7', name: 'Quay ops' },
  ],
  groups: {
    'organizations/11': { name: 'Harbour Co' },
    'folders/22': { name: 'Web', parent: 'organizations/11' },
  },
};
const config = (logs: object = {}) => {
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
      recentProjects: ['tide-tables-123', 'quay-ops-7'],
      starredProjects: [],
      gcp: GCP,
      ...logs,
    },
  });
};
const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(text));
const q = (selector: string) => document.querySelector<HTMLElement>(selector) ?? undefined;
const listed = () =>
  [...document.querySelectorAll('[aria-label="GCP projects"] li')].map(
    (li) => li.textContent ?? '',
  );

function Harness(props: { mode?: CloudMode; query?: CloudFilters }) {
  const [view, setView] = useState({ mode: props.mode ?? 'errors', query: props.query ?? {} });
  return (
    <CloudLogsScreen mode={view.mode} filters={view.query} onView={setView} onSession={() => {}} />
  );
}

function bridge(extra: Record<string, (args: string[]) => unknown> = {}) {
  return fakeBridge({
    config: () => config(),
    'logs projects': () => envelope(LISTED),
    'logs asks': () => envelope({ asks: [] }),
    'logs errors': () => envelope({ env: 'beta', groups: [], warnings: [] }),
    'logs gcp': () => envelope({ env: 'beta', services: [], warnings: [] }),
    'logs setup': () => envelope({ gcp: GCP }),
    'logs star': (args) => envelope({ starred: args.includes('--off') ? [] : [args.at(-1)] }),
    'logs views': () => envelope({ views: [{ name: 'harbour 5xx', metric: 'harbour-5xx' }] }),
    ...extra,
  });
}

test("the switcher shows the projects read and opens on Recent; a star is kept; Apply reads the ticked projects, keeps the envs and imports the new ones' metrics", async () => {
  const { bridge: b, calls } = bridge();
  await renderWithMesa(<Harness />, b);
  await attached();
  await click(q('[aria-label="Projects: tide-tables-123"]'));
  await attached();
  expect(q('[data-testid="cloud-project-switcher"]')).toBeDefined();
  expect(listed()).toEqual([
    expect.stringContaining('Tide tables'),
    expect.stringContaining('Quay ops'),
  ]);
  await click(q('[aria-label="Star quay-ops-7"]'));
  await attached();
  expect(calls.find((argv) => argv[2] === 'star')).toEqual([
    '--json',
    'logs',
    'star',
    '--',
    'quay-ops-7',
  ]);
  expect(q('[aria-label="Unstar quay-ops-7"]')).toBeDefined();
  // All: grouped by organization and folder, with types.
  await click(q('[role="radio"][value="all"]'));
  expect(listed().join('|')).toContain('Harbour Co2Organization');
  await fill(document.querySelector<HTMLInputElement>('[aria-label="Filter projects"]'), 'harbour');
  await click(q('[aria-label="Pick harbour-web-456"]'));
  await click(button('Apply 2 projects'));
  await attached();
  expect(calls.find((argv) => argv[2] === 'setup')).toEqual([
    '--json',
    'logs',
    'setup',
    '--project=tide-tables-123',
    '--project=harbour-web-456',
    `--env=beta=${GCP.envs.beta}`,
    `--env=prod=${GCP.envs.prod}`,
  ]);
  expect(calls.filter((argv) => argv[2] === 'views').map((argv) => argv.at(-1))).toEqual([
    '--project=harbour-web-456',
  ]);
  expect(q('[data-testid="cloud-project-switcher"]')).toBeUndefined();
});

test("a project's name alone switches to just it; a failed metrics import says why", async () => {
  const { bridge: b, calls } = bridge({
    'logs views': () => ({
      ok: false,
      error: { code: 'invalid_config', message: 'no role on quay-ops-7' },
    }),
  });
  const byTestId = await renderWithMesa(<Harness />, b);
  await attached();
  await click(q('[aria-label="Projects: tide-tables-123"]'));
  await attached();
  await click(button('Quay ops'));
  await attached();
  expect(
    calls.find((argv) => argv[2] === 'setup')?.filter((a) => a.startsWith('--project')),
  ).toEqual(['--project=quay-ops-7']);
  expect(toastTexts(byTestId)).toContainEqual(expect.stringContaining('no role on quay-ops-7'));
});

test("Errors with an env says its groups come from that env's logs; All envs reads Error Reporting", async () => {
  const { bridge: b, calls } = bridge();
  await renderWithMesa(<Harness />, b);
  await attached();
  expect(document.body.textContent).toContain('Errors in beta, grouped from its logs');
  const env = document.querySelector<HTMLSelectElement>('[aria-label="Env"]');
  if (env) {
    env.value = '*';
    env.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await attached();
  expect(document.body.textContent).not.toContain('grouped from its logs');
  expect(calls.filter((argv) => argv[2] === 'errors').at(-1)).toContain('--env=*');
});

test('Edit envs starts from the kept envs: one that is a suggestion comes back as it, checked; Save keeps the projects', async () => {
  const { bridge: b, calls } = fakeBridge({
    'logs envs': () =>
      envelope({
        suggestions: [
          { name: 'prod', filter: GCP.envs.prod, from: 'GKE cluster harbour-prod' },
          {
            name: 'sandbox',
            filter: 'resource.labels.cluster_name="sandbox"',
            from: 'GKE cluster sandbox',
          },
        ],
      }),
    'logs setup': () => envelope({ gcp: GCP }),
  });
  let saved = false;
  await renderWithMesa(
    <CloudEnvsDialog gcp={GCP} onSaved={() => (saved = true)} onCancel={() => {}} />,
    b,
  );
  await attached();
  const rows = [...document.querySelectorAll('[aria-label="Suggested envs"] li')].map((li) => ({
    name: li.querySelector<HTMLInputElement>('input[aria-label^="Env name"]')?.value,
    on: li.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
  }));
  expect(rows).toEqual([
    { name: 'prod', on: 'true' },
    { name: 'sandbox', on: 'false' },
  ]);
  expect(document.querySelector<HTMLInputElement>('[aria-label="Env name"]')?.value).toBe('beta');
  await click(button('Save 2 envs'));
  await attached();
  expect(calls.find((argv) => argv[2] === 'setup')).toEqual([
    '--json',
    'logs',
    'setup',
    '--project=tide-tables-123',
    `--env=prod=${GCP.envs.prod}`,
    `--env=beta=${GCP.envs.beta}`,
  ]);
  expect(saved).toBe(true);
});
