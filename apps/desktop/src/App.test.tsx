// @vitest-environment happy-dom
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
