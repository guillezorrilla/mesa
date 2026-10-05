// @vitest-environment happy-dom
import type { Check, Config, HooksStatus, ProjectRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from '@/app/App';
import {
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  renderWithMesa,
  report,
} from '@/lib/testing';

const check = (name: string, status: Check['status'], extra: Partial<Check> = {}): Check => ({
  name,
  ok: status === 'ok',
  status,
  hint: '',
  ...extra,
});

const project = (name: string): ProjectRow =>
  ({ name, label: name, path: `/src/${name}`, exists: true }) as ProjectRow;

/**
 * No profile until `mesa init`; then onboarding at `step`, tmux missing until installed, hooks
 * missing until installed, and two folders found by discovery.
 */
async function setup(
  options: { profile?: boolean; step?: number; obsidian?: boolean; projects?: ProjectRow[] } = {},
) {
  const state = {
    profile: options.profile ?? false,
    step: options.step ?? 0,
    status: 'active',
    tmux: false,
    hooks: false,
    projects: options.projects ?? [],
  };
  const fake = fakeBridge();
  const healthy = (await fake.bridge(['--json', 'config'])) as { data: Config };
  const hooks = (await fake.bridge(['--json', 'hooks', 'status'])) as { data: HooksStatus };
  const missing = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge, calls } = fakeBridge({
    config: () =>
      state.profile
        ? envelope({
            ...healthy.data,
            onboarding: { status: state.status, step: state.step, discovery: 'pending' },
          })
        : missing,
    projects: () => (state.profile ? envelope(state.projects) : missing),
    'obsidian vaults': () =>
      envelope({
        vaults: [{ path: '/h/Notes', name: 'Notes' }],
        suggested: '/h/Documents/Mesa',
      }),
    init: () => {
      state.profile = true;
      return envelope({
        profile: 'default',
        dir: '/h/.mesa/default',
        created: true,
        receipt: null,
      });
    },
    doctor: () =>
      envelope(
        report(
          [
            state.tmux
              ? check('tmux', 'ok', { version: '3.5a' })
              : check('tmux', 'fail', { hint: 'not found', install: 'brew install tmux' }),
            check('claude', 'ok', { version: '2.1.0' }),
            check('codex', 'warn', { install: 'brew install --cask codex' }),
            check('agy', 'warn'),
            check('obsidian', options.obsidian === false ? 'warn' : 'ok'),
          ],
          state.tmux ? { healthy: true, summary: 'ready' } : { healthy: false, summary: 'no tmux' },
        ),
      ),
    'doctor install': () => {
      state.tmux = true;
      return envelope({ name: 'tmux', installed: true });
    },
    'hooks status': () =>
      envelope({ ...hooks.data, installed: state.hooks, codex: { ...hooks.data.codex } }),
    'hooks install': () => {
      state.hooks = true;
      return envelope({ ...hooks.data, changed: true, receipt: null });
    },
    discover: () =>
      envelope({
        projects: [
          { path: '/src/tide', name: 'tide', registered: false, conversations: 2, live: 0 },
          { path: '/src/cove', name: 'cove', registered: false, conversations: 9, live: 0 },
        ],
        live: [],
        conversations: [],
        total: 11,
        unplaced: 0,
      }),
    register: (args) => {
      state.projects.push(project(args.at(-1)?.split('/').at(-1) ?? ''));
      return envelope({ name: 'x', path: args.at(-1), created: false, receipt: null });
    },
    open: () => envelope({ id: 'sess-1', receipt: null }),
    'config set': (args) => {
      const [path, value] = [args.at(-2), JSON.parse(args.at(-1) ?? '')];
      if (path === 'onboarding.step') state.step = value;
      if (path === 'onboarding.status') state.status = value;
      return envelope({ path, value });
    },
  });
  const platform = fakePlatform({ folder: '/src/picked' });
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  return { byTestId, calls, state };
}

const disabled = (element: HTMLElement | undefined) => element?.hasAttribute('disabled');
const stepTitle = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('onboarding-step')[0]?.textContent;
const sets = (calls: string[][]) =>
  calls.filter((args) => args[1] === 'config' && args[2] === 'set').map((args) => args.slice(4));

test('Vault: Obsidian vaults first, a new one suggested; one Continue creates the profile', async () => {
  const { byTestId, calls } = await setup();
  expect(byTestId('onboarding')).toHaveLength(1);
  expect(stepTitle(byTestId)).toBe('Vault');
  expect(document.body.textContent).not.toContain('profile');
  expect(byTestId('vault-choice').map((row) => row.textContent)).toEqual([
    'Notes/h/Notes',
    'Create a new vault/h/Documents/Mesa',
  ]);
  expect(
    byTestId('vault-choice')[0]?.querySelector('[role="radio"]')?.getAttribute('data-state'),
  ).toBe('checked');
  await click(
    byTestId('vault-choice')[1]?.querySelector<HTMLElement>('[role="radio"]') ?? undefined,
  );
  await click(byTestId('onboarding-continue')[0]);
  expect(calls).toContainEqual(['--json', 'init', '--vault=/h/Documents/Mesa']);
  expect(stepTitle(byTestId)).toBe('Requirements');
});

test('Vault: without Obsidian, Create a new vault is preselected and Get Obsidian shows', async () => {
  const { byTestId } = await setup({ obsidian: false });
  expect(byTestId('onboarding')[0]?.textContent).toContain('Get Obsidian');
  const states = byTestId('vault-choice').map((row) =>
    row.querySelector('[role="radio"]')?.getAttribute('data-state'),
  );
  expect(states).toEqual(['unchecked', 'checked']);
});

test('Projects: Continue needs a ticked folder with no project yet; with one, nothing starts ticked', async () => {
  const first = await setup({ profile: true, step: 1 });
  await click(first.byTestId('discovery-tick')[0]);
  await click(first.byTestId('discovery-tick')[1]);
  expect(disabled(first.byTestId('onboarding-continue')[0])).toBe(true);
  document.body.innerHTML = '';
  const again = await setup({ profile: true, step: 1, projects: [project('harbor')] });
  expect(again.byTestId('discovery-tick').map((tick) => tick.getAttribute('data-state'))).toEqual([
    'unchecked',
    'unchecked',
  ]);
  expect(disabled(again.byTestId('onboarding-continue')[0])).toBe(false);
});

test('Requirements: Continue waits for tmux and the hooks; Install fixes tmux, Install hooks the hooks', async () => {
  const { byTestId, calls } = await setup({ profile: true, step: 0 });
  expect(stepTitle(byTestId)).toBe('Requirements');
  expect(disabled(byTestId('onboarding-continue')[0])).toBe(true);
  expect(byTestId('onboarding-skip-hooks')).toEqual([]);
  await click(byTestId('install-button')[0]);
  expect(calls).toContainEqual(['--json', 'doctor', 'install', 'tmux']);
  expect(disabled(byTestId('onboarding-continue')[0])).toBe(true);
  expect(byTestId('onboarding-skip-hooks')).toHaveLength(1);
  expect(byTestId('onboarding')[0]?.textContent).toContain(
    'Adds status hooks to Claude Code and Codex settings',
  );
  await click(byTestId('onboarding-install-hooks')[0]);
  expect(calls).toContainEqual(['--json', 'hooks', 'install']);
  expect(byTestId('hooks-ready')).toHaveLength(1);
  await click(byTestId('onboarding-continue')[0]);
  expect(sets(calls)).toEqual([['onboarding.step', '1']]);
  expect(stepTitle(byTestId)).toBe('Projects');
});

test('Requirements: Skip for now moves on without the hooks', async () => {
  const { byTestId, calls, state } = await setup({ profile: true, step: 0 });
  state.tmux = true;
  await click(byTestId('onboarding-recheck')[0]);
  await click(byTestId('onboarding-skip-hooks')[0]);
  expect(calls).not.toContainEqual(['--json', 'hooks', 'install']);
  expect(stepTitle(byTestId)).toBe('Projects');
});

test('Projects: folders by conversations, ticked; Continue registers them and completes discovery', async () => {
  const { byTestId, calls } = await setup({ profile: true, step: 1 });
  expect(stepTitle(byTestId)).toBe('Projects');
  expect(byTestId('discovered-project').map((row) => row.textContent)).toEqual([
    'cove/src/cove9 conversations',
    'tide/src/tide2 conversations',
  ]);
  await click(byTestId('discovery-tick')[1]);
  await click(
    [...(byTestId('onboarding')[0]?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.includes('Add another folder'),
    ),
  );
  await click(byTestId('onboarding-continue')[0]);
  expect(calls.filter((args) => args[1] === 'register').map((args) => args.at(-1))).toEqual([
    '/src/cove',
    '/src/picked',
  ]);
  expect(sets(calls)).toEqual([
    ['onboarding.discovery', '"complete"'],
    ['onboarding.step', '2'],
  ]);
  expect(stepTitle(byTestId)).toBe('First session');
  expect(byTestId('discovery-dialog')).toEqual([]);
});

test('First session: Start session opens it with Claude and completes onboarding', async () => {
  const { byTestId, calls } = await setup({ profile: true, step: 2, projects: [project('cove')] });
  expect(stepTitle(byTestId)).toBe('First session');
  await click(byTestId('onboarding-start')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--',
    'cove',
  ]);
  expect(sets(calls)).toEqual([['onboarding.status', '"complete"']]);
  expect(byTestId('onboarding')).toEqual([]);
});

test("First session: I'll do it later completes onboarding without a session", async () => {
  const { byTestId, calls } = await setup({ profile: true, step: 2, projects: [project('cove')] });
  await click(byTestId('onboarding-later')[0]);
  expect(calls.filter((args) => args[1] === 'open')).toEqual([]);
  expect(sets(calls)).toEqual([['onboarding.status', '"complete"']]);
  expect(byTestId('onboarding')).toEqual([]);
});

test('relaunching mid-flow resumes at the saved step', async () => {
  const { byTestId } = await setup({ profile: true, step: 1 });
  expect(stepTitle(byTestId)).toBe('Projects');
});
