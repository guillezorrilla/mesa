// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from '@/App';
import { CONFIRMATION_MS } from '@/components/Toast';
import {
  choose,
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  fakeTerminals,
  managedRow,
  PROJECTS,
  renderWithMesa,
  report,
  toasts,
  toastTexts,
} from '@/lib/testing';

test('sidebar opens a project workspace and its Skills tab', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('/src/lantern-cove');
  expect(byTestId('project-workspace')[0]?.textContent).toContain('aaaaaaaa');
  await click(
    [...(byTestId('project-workspace')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.toLowerCase() === 'skills',
    ),
  );
  expect(byTestId('project-workspace')[0]?.textContent).toContain('No skills found.');
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('projects-screen')).toHaveLength(1);
});

test('sidebar selects an exact session and keeps its terminal alive across navigation', async () => {
  const terms = fakeTerminals();
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb', { project: 'other' })]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge, fakePlatform({ terminal: terms.host }));
  expect(byTestId('sidebar-session').map((item) => item.textContent)).toEqual([
    'aaaaaaaa',
    'bbbbbbbb',
  ]);
  await click(byTestId('sidebar-session')[1]);
  expect(byTestId('session-board')[0]?.textContent).toContain('bbbbbbbb');
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(terms.calls.filter((call) => call[0] === 'open').map((call) => call[1])).toEqual([
    'bbbbbbbb',
  ]);
  await click(byTestId('nav-doctor')[0]);
  await click(byTestId('nav-board')[0]);
  await click(byTestId('sidebar-session')[1]);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(terms.calls.filter((call) => call[0] === 'close')).toEqual([]);
  expect(terms.calls.filter((call) => call[0] === 'open')).toHaveLength(1);
  await click(document.querySelector('[aria-label="Collapse sidebar"]') as HTMLElement);
  expect(byTestId('workspace-sidebar')[0]?.dataset.collapsed).toBe('true');
  expect(byTestId('selected-session')).toHaveLength(1);
});

test('project Overview starts worktree goals and quick empty sessions through mesa open', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope(managedRow('newnewnew')),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  const form = byTestId('project-session-form')[0] as HTMLFormElement;
  const agent = [...form.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  await click(agent[1]);
  (byTestId('project-goal')[0] as HTMLTextAreaElement).value = 'Review the API\nThen test it';
  await choose(form.querySelector('#session-location') as HTMLElement, 'worktree');
  (byTestId('project-branch')[0] as HTMLInputElement).value = 'feature/api';
  await act(async () => form.requestSubmit());
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'codex',
    '--goal=Review the API\nThen test it',
    '--branch=feature/api',
    '--',
    'lantern-cove',
  ]);
  await click(byTestId('sidebar-project')[0]);
  await click(byTestId('quick-session')[0]);
  expect(calls).toContainEqual(['--json', 'open', '--no-parent', '--', 'lantern-cove']);
});

test('project controls update profile presentation and leave the slug available when hidden', async () => {
  let rows = PROJECTS.map((row) => ({ ...row }));
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(rows),
    'projects update': (args) => {
      const name = args.at(-1);
      rows = rows.map((row) =>
        row.name === name
          ? {
              ...row,
              label: args.find((arg) => arg.startsWith('--label='))?.slice(8) ?? row.label,
              pinned: args.includes('--pinned') ? args.includes('true') : row.pinned,
              hidden: args.includes('--hidden') ? args.includes('true') : row.hidden,
            }
          : row,
      );
      return envelope({ name, path: rows[0]?.path });
    },
    unregister: () => {
      rows = rows.filter((row) => row.name !== 'lantern-cove');
      return envelope({ name: 'lantern-cove', path: '/src/lantern-cove' });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  const action = (label: string) =>
    [...(byTestId('project-menu')[0]?.parentElement?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.includes(label),
    );
  await click(action('Rename display label'));
  (document.querySelector('#project-label') as HTMLInputElement).value = 'Lantern Cove';
  await click(byTestId('save-project-label')[0]);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('Lantern Cove');
  expect(byTestId('project-workspace')[0]?.textContent).toContain(
    'lantern-cove · /src/lantern-cove',
  );
  await click(action('Pin project'));
  expect(calls).toContainEqual([
    '--json',
    'projects',
    'update',
    '--pinned',
    'true',
    '--',
    'lantern-cove',
  ]);
  await click(action('Hide project'));
  expect(byTestId('sidebar-project').map((element) => element.textContent)).toEqual(['tide']);
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('project-row')[0]?.textContent).toContain('Hidden');
  expect(byTestId('project-row')[0]?.textContent).toContain('lantern-cove');
  await click(byTestId('project-row')[0]?.querySelector('button') as HTMLElement);
  await click(action('Unregister project'));
  expect(byTestId('project-unregister-dialog')).toHaveLength(1);
  await click(byTestId('confirm-unregister-project')[0]);
  expect(calls).toContainEqual(['--json', 'unregister', '--', 'lantern-cove']);
  expect(byTestId('projects-screen')).toHaveLength(1);
});

test('Search Mesa opens with Cmd+K, filters destinations, and navigates with Enter', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(1);
  const input = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    input.value = 'lantern';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(byTestId('palette-hit').map((hit) => hit.textContent)).toEqual([
    'lantern-covelantern-cove · /src/lantern-cove',
    'aaaaaaaalantern-cove · claude · working',
  ]);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(byTestId('project-workspace')).toHaveLength(1);
  await click(byTestId('search-trigger')[0]);
  const again = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    again.value = 'lantern';
    again.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await act(async () => {
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(byTestId('selected-session')).toHaveLength(1);
});

test('Search Mesa shows no matches and Escape returns keyboard focus', async () => {
  const byTestId = await renderWithMesa(<App />, fakeBridge().bridge);
  const trigger = byTestId('search-trigger')[0];
  trigger?.focus();
  await click(trigger);
  const input = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    input.value = 'nothing-matches';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(byTestId('palette-empty')).toHaveLength(1);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(0);
  expect(document.activeElement).toBe(trigger);
});

test('Search Mesa disables New session when no project can start, and opens it when one can', async () => {
  const empty = await renderWithMesa(<App />, fakeBridge().bridge);
  await click(empty('search-trigger')[0]);
  expect(
    empty('palette-hit')
      .find((hit) => hit.textContent?.includes('New session'))
      ?.hasAttribute('disabled'),
  ).toBe(true);
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('search-trigger')[0]);
  await click(byTestId('palette-hit').find((hit) => hit.textContent?.includes('New session')));
  expect(byTestId('new-session-dialog')).toHaveLength(1);
});

test('shortcut settings validate conflicts and update the active profile key', async () => {
  let shortcuts = { ...DEFAULT_SHORTCUTS } as Config['shortcuts'];
  const config = (): Config => ({
    vault: '/h/vault',
    defaultAgent: 'claude',
    skills: [],
    decisions: { backend: 'adapter', adapter: 'claude', threshold: 0.7 },
    sessions: { log: true },
    terminal: { app: 'Terminal' },
    shortcuts,
    run: { permissionMode: 'acceptEdits', allowedTools: [] },
    keys: {},
  });
  const { bridge, calls } = fakeBridge({
    config: () => envelope(config()),
    'config set': (args) => {
      const value = JSON.parse(args.at(-1) ?? '""');
      shortcuts = { ...shortcuts, search: value };
      return envelope({ path: 'shortcuts.search', value });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-shortcuts')[0]);
  const input = byTestId('shortcut-search')[0] as HTMLInputElement;
  const type = async (value: string) =>
    act(async () => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await type('Mod+Q');
  expect(byTestId('save-shortcut-search')[0]?.hasAttribute('disabled')).toBe(true);
  await type('Mod+1');
  expect(byTestId('save-shortcut-search')[0]?.hasAttribute('disabled')).toBe(true);
  await type('Mod+P');
  await click(byTestId('save-shortcut-search')[0]);
  expect(calls).toContainEqual(['--json', 'config', 'set', '--', 'shortcuts.search', '"Mod+P"']);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(0);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(1);
});

test('the header shows the profile, the vault path, and a green or red doctor verdict', async () => {
  const healthy = await renderWithMesa(<App />, fakeBridge().bridge);
  expect(healthy('profile-summary')[0]?.textContent).toBe(
    'Profile: default | Vault: /h/vault Open in Obsidian | Doctor: ok',
  );
  // The verdict's colour comes from its data-health (theme tokens), not an inline style.
  expect(healthy('doctor-health')[0]?.dataset.health).toBe('healthy');

  const sick = fakeBridge({
    doctor: () =>
      envelope(
        report([{ name: 'tmux', ok: false, status: 'fail', hint: '' }], {
          healthy: false,
          summary: 'nothing can run without tmux',
        }),
      ),
    'vault status': () => envelope({ path: '/h/vault', ok: false, missing: ['receipts'] }),
  });
  const byTestId = await renderWithMesa(<App />, sick.bridge);
  expect(byTestId('vault-status')[0]?.textContent).toBe('Vault: /h/vault (missing receipts)');
  expect(byTestId('doctor-health')[0]?.textContent).toBe('Doctor: needs attention');
  expect(byTestId('doctor-health')[0]?.dataset.health).toBe('unhealthy');
});

test('every distinct failure shows once in the toast', async () => {
  const notInit = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge } = fakeBridge({
    config: () => notInit,
    'vault status': () => notInit,
    projects: () => notInit,
    doctor: () => {
      throw new Error('mesa exited with code 1: boom');
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(toastTexts(byTestId).sort()).toEqual([
    'config.yaml not found; run mesa init --vault <path>',
    'mesa exited with code 1: boom',
  ]);
});

test('the log box sends its line to mesa log and shows the entry', async () => {
  const { bridge, calls } = fakeBridge({
    log: (args) =>
      envelope({
        entry: `- 2026-09-24T12:00:00.000Z ${args.at(-1)}`,
        daily: 'daily/2026-09-24.md',
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const input = byTestId('log-input')[0] as HTMLInputElement;
  input.value = 'shipped #12';
  await click(byTestId('log-submit')[0]);
  expect(calls).toContainEqual(['--json', 'log', '--', 'shipped #12']);
  expect(byTestId('log-last')[0]?.textContent).toBe('- 2026-09-24T12:00:00.000Z shipped #12');
  expect(input.value).toBe('');
});

test('Enter twice while a line is being logged logs it once', async () => {
  let release = () => {};
  const { bridge, calls } = fakeBridge({
    log: () =>
      new Promise((done) => {
        release = () => done(envelope({ entry: '- shipped', daily: 'daily/2026-09-24.md' }));
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  (byTestId('log-input')[0] as HTMLInputElement).value = 'shipped #12';
  const form = byTestId('log-box')[0] as HTMLFormElement;
  await act(async () => form.requestSubmit());
  await act(async () => form.requestSubmit());
  await act(async () => release());
  expect(calls.filter((c) => c[1] === 'log')).toHaveLength(1);
});

test('Open in Obsidian runs mesa vault open; a failure shows in the toast', async () => {
  const { bridge, calls } = fakeBridge({
    'vault open': () =>
      envelope({ opened: true, method: 'uri', target: 'obsidian://open?vault=vault' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('open-vault')[0]);
  expect(calls).toContainEqual(['--json', 'vault', 'open']);
  expect(byTestId('toast')).toHaveLength(0);

  const unknown = fakeBridge({
    'vault open': () =>
      failure(
        'Obsidian does not know the vault /h/vault yet: open it once with "Open folder as vault" in Obsidian, then retry',
      ),
  });
  const again = await renderWithMesa(<App />, unknown.bridge);
  await click(again('open-vault')[0]);
  expect(again('toast')[0]?.textContent).toContain('Open folder as vault');
});

/** Types `prompt` into the first row's Send box and sends it. */
async function send(byTestId: (id: string) => HTMLElement[], prompt: string) {
  (byTestId('session-prompt')[0] as HTMLInputElement).value = prompt;
  await click(byTestId('session-send-submit')[0]);
}

test('a confirmation is neutral, shows every time, and goes by itself', async () => {
  vi.useFakeTimers();
  try {
    const { bridge } = fakeBridge({
      sessions: () => envelope([managedRow('aaaaaaaa')]),
      send: () => envelope({ sent: true, session: 'aaaaaaaa', from: null, chars: 5 }),
    });
    const byTestId = await renderWithMesa(<App />, bridge);
    await send(byTestId, 'hello');
    await send(byTestId, 'hello');
    expect(toasts(byTestId)).toEqual([
      ['confirmation', 'Sent 5 characters to aaaaaaaa'],
      ['confirmation', 'Sent 5 characters to aaaaaaaa'],
    ]);
    await act(async () => vi.advanceTimersByTime(CONFIRMATION_MS));
    expect(toasts(byTestId)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('a failure, or a confirmation with a warning, is an alert: warm, once, and it stays', async () => {
  vi.useFakeTimers();
  try {
    let fails = true;
    const { bridge } = fakeBridge({
      sessions: () => envelope([managedRow('aaaaaaaa')]),
      send: () =>
        fails
          ? failure('session aaaaaaaa waits on a person')
          : envelope({
              sent: true,
              session: 'aaaaaaaa',
              from: null,
              chars: 5,
              warning: 'no receipt',
            }),
    });
    const byTestId = await renderWithMesa(<App />, bridge);
    await send(byTestId, 'hello');
    await send(byTestId, 'hello');
    fails = false;
    await send(byTestId, 'hello');
    await act(async () => vi.advanceTimersByTime(2 * CONFIRMATION_MS));
    expect(toasts(byTestId)).toEqual([
      ['alert', 'session aaaaaaaa waits on a person'],
      ['alert', 'Sent 5 characters to aaaaaaaa; no receipt'],
    ]);
  } finally {
    vi.useRealTimers();
  }
});
