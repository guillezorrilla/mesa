// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  click,
  envelope,
  failure,
  fakeBridge,
  fill,
  PROJECTS,
  renderWithMesa,
} from '@/lib/testing';
import { App } from './App';

// First-run discovery at launch and after Set up, and how the welcome tour waits for it.

const NOTHING_FOUND = {
  since: '2026-08-25T12:00:00.000Z',
  days: 30,
  projects: [],
  live: [],
  conversations: [],
  total: 0,
  truncated: false,
  unsupported: [],
};

/** The App at launch with onboarding.discovery `discovery` and `projects` registered. */
async function launchWith(discovery: string, projects: unknown[]) {
  const baseline = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  const { bridge, calls } = fakeBridge({
    config: () =>
      envelope({ ...baseline.data, onboarding: { ...baseline.data.onboarding, discovery } }),
    projects: () => envelope(projects),
    discover: () => envelope(NOTHING_FOUND),
  });
  return { byTestId: await renderWithMesa(<App />, bridge), calls };
}

test.each([
  ['pending with no projects', 'pending', []],
  ['started with projects', 'started', PROJECTS],
])('the discovery dialog opens at launch when %s', async (_, discovery, projects) => {
  const { byTestId, calls } = await launchWith(discovery, projects);
  expect(byTestId('discovery-dialog')).toHaveLength(1);
  expect(calls).toContainEqual(['--json', 'discover']);
});

test.each([
  ['complete', 'complete', []],
  ['dismissed', 'dismissed', []],
  ['pending with a project', 'pending', PROJECTS],
])('the discovery dialog stays closed at launch when %s', async (_, discovery, projects) => {
  const { byTestId, calls } = await launchWith(discovery, projects);
  expect(byTestId('discovery-dialog')).toEqual([]);
  expect(calls).not.toContainEqual(['--json', 'discover']);
});

test('replaying the tour after skipping discovery leaves discovery as the skip set it', async () => {
  const { byTestId, calls } = await launchWith('pending', []);
  await click(byTestId('discovery-skip')[0]);
  await click(byTestId('open-settings')[0]);
  await click(
    [...(byTestId('settings')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Replay tour',
    ),
  );
  const sets = calls.filter((args) => args[1] === 'config' && args[2] === 'set');
  expect(sets.filter((args) => args.join(' ').includes('discovery'))).toEqual([
    ['--json', 'config', 'set', '--', 'onboarding.discovery', '"dismissed"'],
  ]);
  expect(sets.map((args) => args.slice(4))).toContainEqual(['onboarding.status', '"active"']);
});

/**
 * The App through Set up's Create, its new profile with onboarding.discovery `discovery`,
 * `projects` registered, and `found` from `mesa discover`; config sets apply.
 */
async function setUpWith(discovery: string, projects: unknown[], found: unknown = NOTHING_FOUND) {
  const baseline = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  const missing = failure('config.yaml not found; run mesa init --vault <path>');
  let config: Config | undefined;
  const { bridge, calls } = fakeBridge({
    config: () => (config ? envelope(config) : missing),
    projects: () => (config ? envelope(projects) : missing),
    init: () => {
      config = {
        ...baseline.data,
        onboarding: { status: 'active', step: 0, discovery } as Config['onboarding'],
      };
      return envelope({
        profile: 'default',
        dir: '/h/.mesa/default',
        created: true,
        receipt: null,
      });
    },
    'config set': (args) => {
      const path = args.at(-2) ?? '';
      const value = JSON.parse(args.at(-1) ?? 'null');
      if (config) {
        const field = path.split('.').at(-1) ?? '';
        config = { ...config, onboarding: { ...config.onboarding, [field]: value } };
      }
      return envelope({ path, value });
    },
    discover: () => envelope(found),
    'discover adopt': () =>
      envelope({
        project: 'tide-pool',
        registered: true,
        adopted: [{ id: 'aaaaaaaa', agentSessionId: 'x', agent: 'claude' }],
        reopened: [],
        failed: [],
        receipt: null,
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('setup-screen')).toHaveLength(1);
  await fill('setup-vault', '/h/vault');
  await click(byTestId('setup-create')[0]);
  return { byTestId, calls };
}

/** The tour's config writes so far: `onboarding.step` and `onboarding.status`. */
const tourWrites = (calls: string[][]) =>
  calls.filter(
    (args) =>
      args[1] === 'config' &&
      args[2] === 'set' &&
      ['onboarding.step', 'onboarding.status'].includes(args[4] ?? ''),
  );

test('the discovery dialog never covers setup-screen, and opens after its Continue', async () => {
  const { byTestId, calls } = await setUpWith('pending', []);
  expect(byTestId('setup-screen')).toHaveLength(1);
  expect(byTestId('discovery-dialog')).toEqual([]);
  await click(byTestId('setup-continue')[0]);
  expect(byTestId('setup-screen')).toEqual([]);
  expect(byTestId('discovery-dialog')).toHaveLength(1);
  expect(byTestId('welcome-tour')).toEqual([]);
  expect(tourWrites(calls)).toEqual([]);
  await click(byTestId('discovery-skip')[0]);
  expect(byTestId('discovery-dialog')).toEqual([]);
  expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 1 of 3');
});

const ONE_FOUND = {
  ...NOTHING_FOUND,
  projects: [
    {
      path: '/h/tide-pool',
      name: 'tide-pool',
      configured: false,
      registered: false,
      conversations: 2,
      live: 0,
    },
  ],
  total: 2,
};
const pressEscape = (element: HTMLElement | undefined) =>
  act(async () => {
    element?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

test.each([
  [
    'Done',
    async (byTestId: (id: string) => HTMLElement[]) => {
      await click(byTestId('discovery-add')[0]);
      await click(byTestId('discovery-done')[0]);
    },
  ],
  ['Skip', (byTestId: (id: string) => HTMLElement[]) => click(byTestId('discovery-skip')[0])],
  [
    'Escape',
    (byTestId: (id: string) => HTMLElement[]) => pressEscape(byTestId('discovery-dialog')[0]),
  ],
])("after Set up's Continue the tour waits for discovery, then starts on %s", async (_, close) => {
  const { byTestId, calls } = await setUpWith('pending', [], ONE_FOUND);
  await click(byTestId('setup-continue')[0]);
  expect(byTestId('discovery-dialog')).toHaveLength(1);
  expect(byTestId('welcome-tour')).toEqual([]);
  expect(tourWrites(calls)).toEqual([]);
  await close(byTestId);
  expect(byTestId('discovery-dialog')).toEqual([]);
  expect(tourWrites(calls).map((args) => args.slice(4))).toEqual([
    ['onboarding.step', '0'],
    ['onboarding.status', '"active"'],
  ]);
  expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 1 of 3');
  // A later Find from sessions closes without starting the tour again.
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (tab) => tab.textContent === 'Projects',
    ),
  );
  await click(document.querySelector<HTMLElement>('[aria-label="Add project"]') ?? undefined);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'Find from sessions',
    ),
  );
  expect(byTestId('discovery-dialog')).toHaveLength(1);
  await pressEscape(byTestId('discovery-dialog')[0]);
  expect(byTestId('discovery-dialog')).toEqual([]);
  expect(tourWrites(calls)).toHaveLength(2);
});

test.each([
  ['complete', 'complete', []],
  ['dismissed', 'dismissed', []],
  ['pending with a project', 'pending', PROJECTS],
])(
  "Set up's Continue starts the tour at once when discovery is %s",
  async (_, discovery, projects) => {
    const { byTestId, calls } = await setUpWith(discovery, projects);
    await click(byTestId('setup-continue')[0]);
    expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 1 of 3');
    expect(byTestId('discovery-dialog')).toEqual([]);
    expect(calls).not.toContainEqual(['--json', 'discover']);
  },
);
