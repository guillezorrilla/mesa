// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, failure, fakeBridge, PROJECTS, renderWithMesa } from '@/lib/testing';
import { App } from './App';

// First-run discovery at launch; during onboarding its Projects step takes the dialog's place.

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

test('running onboarding again after skipping discovery leaves discovery as the skip set it', async () => {
  const { byTestId, calls } = await launchWith('pending', []);
  await click(byTestId('discovery-skip')[0]);
  await click(byTestId('open-settings')[0]);
  await click(
    [...(byTestId('settings')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Run again',
    ),
  );
  const sets = calls.filter((args) => args[1] === 'config' && args[2] === 'set');
  expect(sets.filter((args) => args.join(' ').includes('discovery'))).toEqual([
    ['--json', 'config', 'set', '--', 'onboarding.discovery', '"dismissed"'],
  ]);
  expect(sets.map((args) => args.slice(4))).toContainEqual(['onboarding.status', '"active"']);
});

test('the discovery dialog never opens over onboarding, from the vault step on', async () => {
  const baseline = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  const missing = failure('config.yaml not found; run mesa init --vault <path>');
  let config: Config | undefined;
  const { bridge } = fakeBridge({
    config: () => (config ? envelope(config) : missing),
    projects: () => (config ? envelope([]) : missing),
    init: () => {
      config = {
        ...baseline.data,
        onboarding: { status: 'active', step: 0, discovery: 'pending', decisionTip: 'pending' },
      };
      return envelope({
        profile: 'default',
        dir: '/h/.mesa/default',
        created: true,
        receipt: null,
      });
    },
    discover: () => envelope(NOTHING_FOUND),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('onboarding-continue')[0]);
  expect(byTestId('onboarding-step')[0]?.textContent).toBe('Requirements');
  expect(byTestId('discovery-dialog')).toEqual([]);
});
