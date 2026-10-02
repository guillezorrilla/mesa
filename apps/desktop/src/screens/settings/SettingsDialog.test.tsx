// @vitest-environment happy-dom
import type { Config, DoctorReport } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { SettingsDialog } from './SettingsDialog';

const base = async () =>
  ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
const doctor: DoctorReport = {
  healthy: true,
  summary: 'ready',
  checks: [
    { name: 'claude', ok: true, status: 'ok', version: '2.1.282', hint: '' },
    { name: 'codex', ok: false, status: 'warn', hint: 'not found' },
  ],
};
const render = (bridge: Parameters<typeof renderWithMesa>[1], category?: 'git') =>
  renderWithMesa(
    <SettingsDialog
      open
      onOpenChange={() => {}}
      category={category}
      doctor={doctor}
      doctorBusy={false}
      onRecheck={() => {}}
      onNavigate={() => {}}
      onReplayTour={() => {}}
      onChanged={() => {}}
    />,
    bridge,
  );
const nav = (label: string) =>
  [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="Settings categories"] button'),
  ].find((button) => button.textContent === label);
const sets = (calls: string[][]) =>
  calls.filter((args) => args[2] === 'set').map((args) => args.slice(-2));
const type = async (id: string, text: string) => {
  const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  await act(async () => {
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
};

test('the window lists Xirp categories and saves the default coding agent, claude by default', async () => {
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge);
  expect(
    [...document.querySelectorAll('[aria-label="Settings categories"] > div > button')].map(
      (button) => button.textContent,
    ),
  ).toEqual([
    'General',
    'Sessions',
    'Terminal & Editor',
    'Git & Worktrees',
    'Notifications',
    'Coding Agents',
    'Advanced',
  ]);
  await click(nav('Sessions'));
  const agent = document.getElementById('default-agent') as HTMLSelectElement;
  expect(agent.value).toBe('claude');
  await choose(agent, 'codex');
  expect(sets(calls)).toEqual([['defaultAgent', '"codex"']]);
});

test('search finds a row in any category and hides the sections without a match', async () => {
  await render(fakeBridge().bridge);
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search settings"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'vim');
    search?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const shown = [...document.querySelectorAll<HTMLElement>('[data-setting-row]')].filter(
    (row) => !row.hidden,
  );
  expect(shown.map((row) => row.querySelector('label')?.textContent)).toEqual(['Vim Mode']);
  const empty = document.querySelector('[data-empty]');
  expect(empty?.textContent).toBe('No settings match.');
});

test('the editor tab size saves a number, and the editor command must be an argv', async () => {
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge);
  await click(nav('Terminal & Editor'));
  await choose(document.getElementById('editor-tab-size') ?? undefined, '4');
  await type('editor-external', 'code {file}');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Enter a JSON array of argument strings.',
  );
  expect(sets(calls)).toEqual([['editor.tabSize', '4']]);
});

test('worktree settings save whole, so clearing the base removes it and custom needs its folder', async () => {
  const config = await base();
  const withBase = { ...config, worktrees: { ...config.worktrees, base: 'main' } };
  const { bridge, calls } = fakeBridge({
    config: () => envelope(withBase),
    'config set': () => envelope({}),
  });
  await render(bridge, 'git');
  await type('worktree-base', '');
  await choose(document.getElementById('worktree-location') ?? undefined, 'custom');
  expect(sets(calls)).toHaveLength(1);
  await type('worktree-root', '/h/worktrees');
  const [cleared, custom] = sets(calls).map(([, value]) => JSON.parse(value ?? '{}'));
  expect(cleared).toEqual({ ...withBase.worktrees, base: undefined });
  expect('base' in cleared).toBe(false);
  expect(custom).toMatchObject({ location: 'custom', customRoot: '/h/worktrees' });
});

test('Git & Worktrees has Delete branch by default under Cleanup, off until switched on', async () => {
  const config = await base();
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge, 'git');
  const cleanup = document.querySelector('section[aria-label="Cleanup"]');
  expect(cleanup?.textContent).toContain('Delete branch by default');
  const toggle = cleanup?.querySelector<HTMLElement>('#worktree-delete-branch');
  expect(toggle?.getAttribute('aria-checked')).toBe('false');
  await click(toggle ?? undefined);
  expect(sets(calls).map(([path, value]) => [path, JSON.parse(value ?? '{}')])).toEqual([
    ['worktrees', { ...config.worktrees, deleteBranch: true }],
  ]);
});

test('session hooks show each agent and install; agents show what Doctor found', async () => {
  const { bridge, calls } = fakeBridge({
    'hooks install': () => envelope({ changed: true, receipt: null }),
  });
  const byTestId = await render(bridge);
  await click(nav('Notifications'));
  const panel = () => byTestId('settings')[0]?.textContent ?? '';
  expect(panel()).toContain('Claude Code: installed');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Reinstall',
    ),
  );
  expect(calls.some((args) => args[1] === 'hooks' && args[2] === 'install')).toBe(true);
  await click(nav('Coding Agents'));
  expect(panel()).toContain('Claude CodeInstalled · 2.1.282');
  expect(panel()).toContain('CodexNot installed');
});

test('Clear notification center shows the unread count and clears after a confirmation', async () => {
  const notice = {
    session: 'aaaaaaaa',
    kind: 'finished',
    title: 'Session turn finished',
    target: { kind: 'session', id: 'aaaaaaaa' },
  };
  let cleared = false;
  const { bridge, calls } = fakeBridge({
    notifications: () =>
      envelope(
        cleared
          ? []
          : [
              { ...notice, id: 'a', at: '2026-09-23T09:00:00.000Z', read: false },
              { ...notice, id: 'b', at: '2026-09-23T08:00:00.000Z', read: true },
            ],
      ),
    'notifications clear --all': () => {
      cleared = true;
      return envelope({ count: 2 });
    },
  });
  const byTestId = await render(bridge);
  await click(nav('Notifications'));
  const row = () =>
    [...document.querySelectorAll<HTMLElement>('[data-setting-row]')].find((item) =>
      item.textContent?.startsWith('Clear notification center'),
    );
  expect(row()?.textContent).toContain('1 unread');
  await click(row()?.querySelector('button') ?? undefined);
  expect(calls.some((args) => args[2] === 'clear')).toBe(false);
  await click(byTestId('confirm-clear-notifications')[0]);
  expect(calls.filter((args) => args[2] === 'clear')).toEqual([
    ['--json', 'notifications', 'clear', '--all'],
  ]);
  expect(row()?.textContent).toContain('0 unread');
});

test('appearance has diff and file tree size sliders from 10 to 20 that save their paths', async () => {
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge);
  for (const [id, path, value] of [
    ['appearance-diff-size', 'appearance.diffFontSize', '13'],
    ['appearance-tree-size', 'appearance.fileTreeFontSize', '14'],
  ] as const) {
    const slider = document.getElementById(id) as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(['10', '20', value]);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '16');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    expect(sets(calls).at(-1)).toEqual([path, '16']);
  }
});
