// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { attached, click, envelope, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { CloudSetupPanel } from './CloudSetupPanel';

/** Invented projects: the default, two more, then many an account also sees. */
const PROJECTS = [
  { id: 'quay-ops-7', name: 'Quay ops' },
  { id: 'harbour-web-456', name: 'Harbour web' },
  { id: 'tide-tables-123', name: 'Tide tables' },
  ...Array.from({ length: 1600 }, (_, i) => ({ id: `zz-lab-${i}`, name: `Zz lab ${i}` })),
];
const SUGGESTIONS = {
  'tide-tables-123': [
    {
      name: 'prod',
      filter: 'resource.labels.cluster_name="harbour-prod"',
      from: 'GKE cluster harbour-prod',
    },
    {
      name: 'sandbox',
      filter: 'resource.labels.cluster_name="sandbox"',
      from: 'GKE cluster sandbox',
    },
  ],
  'harbour-web-456': [
    {
      name: 'beta',
      filter: 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"-beta$"',
      from: 'Cloud Run services ending -beta',
    },
  ],
} as Record<string, object[]>;
const projectsOf = (args: string[]) =>
  args.filter((a) => a.startsWith('--project=')).map((a) => a.slice('--project='.length));

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) ?? undefined;
/** The project rows shown, pinned and grouped (not the groups' headers). */
const rowNames = () =>
  [...document.querySelectorAll('[aria-label="GCP projects"] li')]
    .filter((li) => li.querySelector('[role="checkbox"]'))
    .map((li) => li.textContent);
const groupRows = () =>
  [
    ...document.querySelectorAll<HTMLElement>('[aria-label="GCP projects"] button[aria-expanded]'),
  ].map((b) => `${b.getAttribute('aria-expanded') === 'true' ? '-' : '+'} ${b.textContent}`);
const rowBox = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[aria-label="GCP projects"] li')]
    .find((li) => li.textContent?.includes(text))
    ?.querySelector<HTMLElement>('[role="checkbox"]') ?? undefined;
const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(text));

function bridgeFor(projects: Promise<unknown> | unknown) {
  return fakeBridge({
    'logs projects': () => projects,
    'logs envs': (args) =>
      envelope({ suggestions: projectsOf(args).flatMap((p) => SUGGESTIONS[p] ?? []) }),
    'logs setup': () => envelope({ gcp: {} }),
    'logs views': () => envelope({ views: [] }),
  });
}

test('setup loads every project once, shows only the rows in view, filters as you type, and picks with chips', async () => {
  let answer: (value: unknown) => void = () => {};
  const { bridge, calls } = bridgeFor(new Promise((resolve) => (answer = resolve)));
  await renderWithMesa(<CloudSetupPanel onSaved={() => {}} />, bridge);
  await attached();
  expect(q('[aria-label="Loading projects"]')).toBeDefined();
  answer(envelope({ current: 'tide-tables-123', projects: PROJECTS }));
  await attached();
  // gcloud's default first and picked; a list of 1603 draws only about a screen of rows.
  expect(rowNames()[0]).toContain('Tide tables');
  expect(rowNames()[0]).toContain('gcloud default');
  expect(rowNames().length).toBeLessThan(30);
  expect(q('[aria-label="Picked projects"]')?.textContent).toContain('Tide tables');
  await fill(q<HTMLInputElement>('[aria-label="Filter projects"]'), 'HARB');
  expect(rowNames()).toEqual([expect.stringContaining('Harbour web')]);
  await click(rowBox('harbour-web-456'));
  await fill(q<HTMLInputElement>('[aria-label="Filter projects"]'), '');
  // Picked ones come right after the default, then the groups.
  expect(rowNames().slice(0, 2)).toEqual([
    expect.stringContaining('Tide tables'),
    expect.stringContaining('Harbour web'),
  ]);
  expect(groupRows()[0]).toBe('- No organization1,603');
  await click(q('[aria-label="Remove tide-tables-123"]'));
  expect(q('[aria-label="Picked projects"]')?.textContent).not.toContain('Tide tables');
  expect(calls.filter((argv) => argv[2] === 'projects')).toHaveLength(1);
});

test('envs are suggested for the projects picked, the guessed ones checked; renames and custom envs save with the projects', async () => {
  const { bridge, calls } = bridgeFor(envelope({ current: 'tide-tables-123', projects: PROJECTS }));
  const onSaved = vi.fn();
  await renderWithMesa(<CloudSetupPanel onSaved={onSaved} />, bridge);
  await attached();
  await click(rowBox('harbour-web-456'));
  await attached();
  const suggested = () =>
    [...document.querySelectorAll<HTMLElement>('[aria-label="Suggested envs"] li')].map((li) => ({
      text: li.textContent,
      on: li.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
    }));
  expect(suggested()).toEqual([
    { text: expect.stringContaining('GKE cluster harbour-prod'), on: 'true' },
    { text: expect.stringContaining('GKE cluster sandbox'), on: 'false' },
    { text: expect.stringContaining('Cloud Run services ending -beta'), on: 'true' },
  ]);
  // A sandbox renamed beta is checked and joins the Cloud Run beta rule.
  await fill(q<HTMLInputElement>('[aria-label="Env name for GKE cluster sandbox"]'), 'beta');
  await click(button('Custom env'));
  await fill(q<HTMLInputElement>('[aria-label="Env name"]'), 'jobs');
  await fill(
    q<HTMLInputElement>('[aria-label="Env filter"]'),
    'resource.labels.namespace_name="jobs"',
  );
  await click(button('Save 2 projects and 3 envs'));
  await attached();
  const setup = calls.find((argv) => argv[2] === 'setup') ?? [];
  expect(setup).toEqual(
    expect.arrayContaining([
      '--project=tide-tables-123',
      '--project=harbour-web-456',
      '--env=prod=resource.labels.cluster_name="harbour-prod"',
      '--env=beta=(resource.labels.cluster_name="sandbox") OR (resource.type="cloud_run_revision" AND resource.labels.service_name=~"-beta$")',
      '--env=jobs=resource.labels.namespace_name="jobs"',
    ]),
  );
  expect(calls.filter((argv) => argv[2] === 'views').map(projectsOf)).toEqual([
    ['tide-tables-123'],
    ['harbour-web-456'],
  ]);
  expect(onSaved).toHaveBeenCalled();
});

test('a listing that fails shows its message and Retry, which reads again; envs that fail say why, with Retry', async () => {
  let fail = true;
  let envsFail = true;
  const { bridge, calls } = fakeBridge({
    'logs projects': () =>
      fail
        ? {
            ok: false,
            error: {
              code: 'invalid_config',
              message: 'gcloud has no signed-in account: run gcloud auth login',
              details: { reason: 'signed_out', fix: 'gcloud auth login' },
            },
          }
        : envelope({ current: 'tide-tables-123', projects: PROJECTS.slice(0, 3), groups: {} }),
    'logs envs': () =>
      envsFail
        ? { ok: false, error: { code: 'internal', message: 'gcloud failed: quota exceeded' } }
        : envelope({ suggestions: SUGGESTIONS['tide-tables-123'] }),
  });
  await renderWithMesa(<CloudSetupPanel onSaved={() => {}} />, bridge);
  await attached();
  const alerts = () =>
    [...document.querySelectorAll('[aria-label="Set up Cloud Logs"] [role="alert"]')].map(
      (a) => a.textContent,
    );
  expect(alerts()).toEqual([
    expect.stringContaining('gcloud has no signed-in account'),
    expect.stringContaining('gcloud failed: quota exceeded'),
  ]);
  expect(q('[aria-label="GCP projects"]')).toBeUndefined();
  fail = false;
  envsFail = false;
  const retries = [
    ...document.querySelectorAll<HTMLElement>(
      '[aria-label="Set up Cloud Logs"] [role="alert"] button',
    ),
  ].filter((b) => b.textContent?.includes('Retry'));
  for (const retry of retries) await click(retry);
  await attached();
  expect(alerts()).toEqual([]);
  expect(rowNames()[0]).toContain('Tide tables');
  expect(calls.filter((argv) => argv[2] === 'projects')).toHaveLength(2);
  expect(document.querySelector('[aria-label="Suggested envs"]')?.textContent).toContain(
    'GKE cluster harbour-prod',
  );
});

test('projects are grouped by organization, folders nested with counts; a large folder starts closed; the filter opens matches', async () => {
  const lab = Array.from({ length: 25 }, (_, i) => ({
    id: `lab-${i}`,
    name: `Lab ${i}`,
    parent: 'folders/44',
  }));
  const { bridge } = bridgeFor(
    envelope({
      current: 'tide-tables-123',
      projects: [
        { id: 'quay-ops-7', name: 'Quay ops' },
        { id: 'tide-tables-123', name: 'Tide tables', parent: 'folders/22' },
        { id: 'harbour-web-456', name: 'Harbour web', parent: 'organizations/11' },
        ...lab,
      ],
      groups: {
        'organizations/11': { name: 'Harbour Co' },
        'folders/22': { name: 'Tides', parent: 'organizations/11' },
        'folders/44': { name: 'Sandbox', parent: 'organizations/11' },
      },
    }),
  );
  await renderWithMesa(<CloudSetupPanel onSaved={() => {}} />, bridge);
  await attached();
  expect(groupRows()).toEqual([
    '- No organization1',
    '- Harbour Co27Organization',
    '+ Sandbox25Folder',
    '- Tides1Folder',
  ]);
  expect(rowNames().some((name) => name?.includes('Lab 3'))).toBe(false);
  await click(button('Sandbox'));
  expect(rowNames().some((name) => name?.includes('Lab 3'))).toBe(true);
  await click(button('Sandbox'));
  await fill(q<HTMLInputElement>('[aria-label="Filter projects"]'), 'lab 1');
  expect(groupRows()).toEqual(['- Harbour Co11Organization', '- Sandbox11Folder']);
  expect(rowNames()).toHaveLength(11);
});
