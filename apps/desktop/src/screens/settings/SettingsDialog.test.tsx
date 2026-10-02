// @vitest-environment happy-dom
import type { Config, DoctorReport, ProjectRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, PROJECTS, renderWithMesa } from '@/lib/testing';
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

test('the window lists the reference app categories and saves the default coding agent, claude by default', async () => {
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
    'Projects',
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

test('Sessions has the status line cost toggle, off by default, saved to sessions.statusLineCost', async () => {
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge);
  await click(nav('Sessions'));
  const toggle = document.getElementById('sessions-status-line-cost');
  expect(toggle?.getAttribute('aria-checked')).toBe('false');
  await click(toggle ?? undefined);
  expect(sets(calls)).toEqual([['sessions.statusLineCost', 'true']]);
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

test('profile scripts say they are one executable and its arguments, run without a shell', async () => {
  await render(fakeBridge().bridge, 'git');
  for (const id of ['worktree-setup', 'worktree-teardown']) {
    const field = document.getElementById(id) as HTMLTextAreaElement;
    expect(field.closest('[data-setting-row]')?.textContent).toContain(
      'The executable and its arguments, one per line; runs without a shell.',
    );
  }
  expect((document.getElementById('worktree-setup') as HTMLTextAreaElement).placeholder).toBe(
    'pnpm\ninstall',
  );
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

test('Notifications has the visual alert toggle, on by default, and saves it off', async () => {
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge);
  await click(nav('Notifications'));
  const toggle = document.getElementById('notifications-visual-alert');
  expect(toggle?.closest('[data-setting-row]')?.textContent).toContain('Visual alert');
  expect(toggle?.getAttribute('aria-checked')).toBe('true');
  await click(toggle ?? undefined);
  expect(sets(calls)).toEqual([['notifications.visualAlert', 'false']]);
});

test('Coding Agents has a launch section per agent, dangerous rows in red, each on native config until set', async () => {
  const set = {
    ...(await base()),
    agents: {
      claude: {},
      codex: { sandbox: 'danger-full-access' as const, bypass: true },
      antigravity: {},
    },
  };
  const { bridge, calls } = fakeBridge({
    config: () => envelope(set),
    'config set': () => envelope({}),
  });
  await render(bridge);
  await click(nav('Coding Agents'));
  const rows = (section: string) =>
    [...document.querySelectorAll(`#settings-${section} [data-setting-row]`)].map((row) => [
      row.querySelector('label')?.textContent,
      row.querySelector('label')?.classList.contains('text-destructive'),
    ]);
  expect(rows('claude')).toEqual([['Skip permissions', true]]);
  expect(rows('codex')).toEqual([
    ['Approval policy', false],
    ['Sandbox', true],
    ['Bypass approvals and sandbox', true],
  ]);
  expect(rows('antigravity')).toEqual([
    ['Skip permissions', true],
    ['Mode', false],
    ['Sandbox', false],
  ]);
  // A red row warns in its description; the others do not.
  for (const row of document.querySelectorAll(
    ['claude', 'codex', 'antigravity'].map((id) => `#settings-${id} [data-setting-row]`).join(),
  )) {
    const red = row.querySelector('label')?.classList.contains('text-destructive');
    if (red) expect(row.querySelector('p')?.textContent).toContain('Danger:');
    else expect(row.querySelector('p')?.textContent).not.toMatch(/^Danger:/);
  }
  const select = (id: string) => document.getElementById(id) as HTMLSelectElement;
  expect(select('launch-claude-skipPermissions').value).toBe('');
  expect(select('launch-claude-skipPermissions').options[0]?.textContent).toBe('Use native config');
  expect(select('launch-codex-sandbox').value).toBe('danger-full-access');
  expect(select('launch-codex-bypass').value).toBe('on');

  await choose(select('launch-claude-skipPermissions'), 'on');
  await choose(select('launch-antigravity-mode'), 'accept-edits');
  await choose(select('launch-codex-sandbox'), '');
  await choose(select('launch-codex-approvalPolicy'), 'never');
  expect(sets(calls)).toEqual([
    ['agents.claude', '{"skipPermissions":true}'],
    ['agents.antigravity', '{"mode":"accept-edits"}'],
    ['agents.codex', '{"bypass":true}'],
    ['agents.codex', '{"sandbox":"danger-full-access","bypass":true,"approvalPolicy":"never"}'],
  ]);
});

test('Terminal & Editor has the message actions toggle, on by default, and saves it off', async () => {
  const { bridge, calls } = fakeBridge({ 'config set': () => envelope({}) });
  await render(bridge);
  await click(nav('Terminal & Editor'));
  const toggle = document.getElementById('message-actions');
  expect(toggle?.closest('[data-setting-row]')?.textContent).toContain('Message Actions');
  expect(toggle?.getAttribute('aria-checked')).toBe('true');
  await click(toggle ?? undefined);
  expect(sets(calls)).toEqual([['terminal.messageActions', 'false']]);
});

test('Projects picks a project and edits its overrides, each row naming the profile value it inherits', async () => {
  const config = await base();
  const profile = {
    ...config,
    worktrees: { ...config.worktrees, base: 'main', fetch: true, setup: ['pnpm', 'install'] },
  };
  const [cove, tide] = PROJECTS as [ProjectRow, ProjectRow];
  const projects: ProjectRow[] = [
    { ...cove, overrides: { worktrees: { fetch: false, sparseDirectories: ['apps/web'] } } },
    { ...tide, name: 'reef', exists: true, overrides: { terminal: { theme: 'dark' } } },
  ];
  const { bridge, calls } = fakeBridge({
    config: () => envelope(profile),
    projects: () => envelope(projects),
    'projects set': () => envelope({ receipt: null }),
  });
  await render(bridge);
  await click(nav('Projects'));
  const row = (id: string) => document.getElementById(id)?.closest('[data-setting-row]');
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  expect(field('project-settings-project').value).toBe('lantern-cove');
  expect(row('project-worktree-base')?.textContent).toContain('Profile: main');
  expect(row('project-worktree-fetch')?.textContent).toContain('Profile: on');
  expect(row('project-worktree-setup-mode')?.textContent).toContain('Profile: pnpm, install');
  expect(row('project-worktree-setup-mode')?.textContent).toContain(
    'The executable and its arguments, one per line; runs without a shell.',
  );
  expect(field('project-worktree-setup-mode').value).toBe('inherit');
  expect(document.getElementById('project-worktree-setup')).toBeNull();
  expect(row('project-worktree-sparse')?.textContent).toContain('Profile: everything');
  expect(row('project-terminal-theme')?.textContent).toContain('Profile: Follow interface theme');
  expect(field('project-worktree-fetch').value).toBe('false');
  expect(field('project-worktree-sparse').value).toBe('apps/web');
  expect(field('project-worktree-base').value).toBe('');

  await type('project-worktree-base', 'develop');
  await choose(field('project-worktree-fetch'), '');
  await type('project-worktree-sparse', '');
  await choose(field('project-worktree-teardown-mode'), 'custom');
  expect(field('project-worktree-teardown').placeholder).toBe('pnpm\ninstall');
  await type('project-worktree-teardown', 'make\nclean');
  // None is an empty list, so the profile's setup does not run either; it differs from inherit.
  await choose(field('project-worktree-setup-mode'), 'none');
  await choose(field('project-terminal-theme'), 'light');
  const projectSets = () =>
    calls
      .filter((args) => args[1] === 'projects' && args[2] === 'set')
      .map((args) => args.slice(3));
  expect(projectSets()).toEqual([
    ['--', 'lantern-cove', 'worktrees.base', '"develop"'],
    ['--unset', '--', 'lantern-cove', 'worktrees.fetch'],
    ['--unset', '--', 'lantern-cove', 'worktrees.sparseDirectories'],
    ['--', 'lantern-cove', 'worktrees.teardown', '["make","clean"]'],
    ['--', 'lantern-cove', 'worktrees.setup', '[]'],
    ['--', 'lantern-cove', 'terminal.theme', '"light"'],
  ]);

  await choose(field('project-settings-project'), 'reef');
  expect(field('project-terminal-theme').value).toBe('dark');
  expect(field('project-worktree-sparse').value).toBe('');
  await choose(field('project-terminal-theme'), '');
  expect(projectSets().at(-1)).toEqual(['--unset', '--', 'reef', 'terminal.theme']);
});

test("Projects shows a repository's unapproved scripts exactly and approves them through projects trust", async () => {
  const [cove] = PROJECTS as [ProjectRow];
  const setup = ['/usr/bin/make', 'set up'];
  let projects: ProjectRow[] = [
    {
      ...cove,
      overrides: { worktrees: { setup } },
      unapproved: { setup: { argv: setup, fingerprint: 'a'.repeat(64) } },
    },
  ];
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(projects),
    'projects trust': () => {
      projects = [{ ...cove, overrides: { worktrees: { setup } }, unapproved: {} }];
      return envelope({ project: 'lantern-cove', setup, receipt: null });
    },
  });
  const byTestId = await render(bridge);
  await click(nav('Projects'));
  const review = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Review');
  expect(review?.closest('[data-setting-row]')?.textContent).toContain(
    'Scripts waiting for approval',
  );
  await click(review);
  expect(byTestId('approve-scripts')[0]?.querySelector('pre')?.textContent).toBe(
    '"/usr/bin/make" "set up"',
  );
  await click(byTestId('approve-scripts-submit')[0]);
  // The fingerprint of the argv the dialog showed, so trust refuses a mesa.yaml changed meanwhile.
  expect(calls).toContainEqual([
    '--json',
    'projects',
    'trust',
    '--expect',
    'a'.repeat(64),
    '--',
    'lantern-cove',
  ]);
  expect(byTestId('approve-scripts')).toHaveLength(0);
  expect(document.body.textContent).not.toContain('Scripts waiting for approval');
});
