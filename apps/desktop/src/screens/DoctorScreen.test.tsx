// @vitest-environment happy-dom
import type { Check, TmuxWindow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { App } from '@/App';
import { cells, click, envelope, fakeBridge, renderWithMesa, report } from '@/lib/testing';

const check = (version: string): Check => ({
  name: 'tmux',
  ok: true,
  status: 'ok',
  version,
  hint: '',
});

test('the Doctor screen shares the header run; Recheck runs doctor again', async () => {
  let version = 1;
  const { bridge, calls } = fakeBridge({
    doctor: () => envelope(report([check(`3.${version++}`)])),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);

  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.1');
  await click(byTestId('doctor-recheck')[0]);
  expect(byTestId('doctor-row')[0]?.textContent).toBe('tmux✓3.2');
  expect(calls.filter((c) => c[1] === 'doctor')).toHaveLength(2);
  expect(calls.filter((c) => c[1] === 'windows')).toHaveLength(2);
});

test('Doctor shows bounded diagnostic event names and filters through the CLI bridge', async () => {
  const { bridge, calls } = fakeBridge({
    diagnostics: (args) =>
      envelope({
        total: args.includes('--event') ? 1 : 2,
        limit: 100,
        events: [
          { at: '2026-09-24T12:00:00.000Z', session: 'aaaaaaaa', agent: 'claude', event: 'Stop' },
        ],
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('doctor-panel')[0]?.textContent).toContain('aaaaaaaa claude Stop');
  const input = document.querySelector<HTMLInputElement>('[aria-label="Filter diagnostic events"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Stop');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(calls.some((args) => args.includes('diagnostics') && args.includes('--event'))).toBe(true);
});

test('Doctor shows installed and qualified versions with unsupported native operations', async () => {
  const claude: Check = { name: 'claude', ok: true, status: 'ok', version: '2.1.284', hint: '' };
  const { bridge } = fakeBridge({ doctor: () => envelope(report([check('3.7c'), claude])) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  const rows = byTestId('agent-capability').map((row) => row.textContent);
  expect(rows[0]).toContain('Installed 2.1.284.Qualified on 2.1.284:');
  expect(rows[1]).toContain('Not installed.Qualified on 0.157.1:');
  expect(rows[2]).toContain(
    'Unsupported natively: background, fork, adopt, history, search, context.',
  );
});

test('the Doctor screen shows which decisions backend Faro uses', async () => {
  const decisions: Check = {
    name: 'decisions',
    ok: true,
    status: 'ok',
    version: 'adapter',
    hint: 'rules first; adapter below confidence 0.7',
  };
  const { bridge } = fakeBridge({ doctor: () => envelope(report([check('3.6'), decisions])) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(cells(byTestId('doctor-row')[1])).toEqual([
    'decisions',
    '✓',
    'adapter',
    'rules first; adapter below confidence 0.7',
  ]);
});

test('the Doctor screen lists the windows on the Mesa tmux server', async () => {
  const window = (name: string, dead: boolean): TmuxWindow => ({
    project: 'lantern-cove',
    window: name,
    index: 0,
    panePid: 4242,
    command: '2.1.282',
    path: '/src/lantern-cove',
    activity: '2026-09-25T12:00:00.000Z',
    dead,
  });
  const { bridge } = fakeBridge({
    windows: () => envelope([window('claude-aaaaaa', false), window('claude-bbbbbb', true)]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('tmux-window').map((li) => li.textContent)).toEqual([
    'lantern-cove:claude-aaaaaa 2.1.282 /src/lantern-cove',
    'lantern-cove:claude-bbbbbb (exited) /src/lantern-cove',
  ]);

  const empty = await renderWithMesa(<App />, fakeBridge().bridge);
  await click(empty('nav-doctor')[0]);
  expect(empty('tmux-none')).toHaveLength(1);
});

test('the Doctor screen shows the Claude hooks and installs them when missing', async () => {
  let installed = false;
  const { bridge, calls } = fakeBridge({
    'hooks status': () =>
      envelope({ path: '/h/.claude/settings.json', installed, stale: false, events: {} }),
    'hooks install': () => {
      installed = true;
      return envelope({
        path: '/h/.claude/settings.json',
        installed,
        stale: false,
        events: {},
        changed: true,
      });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('hooks-status')[0]?.textContent).toBe(
    'Not installed in /h/.claude/settings.json Install',
  );
  await click(byTestId('hooks-install')[0]);
  expect(calls).toContainEqual(['--json', 'hooks', 'install']);
  expect(byTestId('hooks-status')[0]?.textContent).toBe(
    'Installed in /h/.claude/settings.json Uninstall',
  );
});

test('an unhealthy report shows its summary and each row by status', async () => {
  const missing: Check = {
    name: 'tmux',
    ok: false,
    status: 'fail',
    hint: 'install with `brew install tmux`',
  };
  const verdict = { healthy: false, summary: 'nothing can run without tmux' };
  const { bridge } = fakeBridge({ doctor: () => envelope(report([missing], verdict)) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('doctor-summary')[0]?.textContent).toBe('nothing can run without tmux');
  expect(byTestId('doctor-row')[0]?.dataset.status).toBe('fail');
});

test('the Doctor panel shows both kinds of hook, each with its fix when missing', async () => {
  const hookRows: Check[] = [
    {
      name: 'claude hooks',
      ok: false,
      status: 'warn',
      hint: 'not installed: run `mesa hooks install`',
    },
    {
      name: 'tmux hooks',
      ok: false,
      status: 'warn',
      hint: 'not set on mesa-default: `mesa sessions` starts the server with it',
    },
  ];
  const { bridge } = fakeBridge({ doctor: () => envelope(report(hookRows)) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  const rows = byTestId('doctor-row').filter((r) => cells(r)[0]?.endsWith('hooks'));
  expect(rows.map((r) => [cells(r)[0], r.dataset.status, cells(r)[3]])).toEqual([
    ['claude hooks', 'warn', 'not installed: run `mesa hooks install`'],
    ['tmux hooks', 'warn', 'not set on mesa-default: `mesa sessions` starts the server with it'],
  ]);
});

test('installing the hooks from the Doctor panel runs doctor again, so its row agrees', async () => {
  const { bridge, calls } = fakeBridge({
    'hooks status': () =>
      envelope({
        path: '/h/.claude/settings.json',
        installed: false,
        stale: false,
        events: {},
        tmux: { socket: 'mesa-default', server: true, paneDied: true },
      }),
    'hooks install': () =>
      envelope({
        path: '/h/.claude/settings.json',
        installed: true,
        stale: false,
        events: {},
        changed: true,
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  const doctorRuns = () => calls.filter((c) => c[1] === 'doctor').length;
  const before = doctorRuns();
  await click(byTestId('hooks-install')[0]);
  expect(doctorRuns()).toBe(before + 1);
});

test('Doctor shows each Codex trust state and installs when only Claude hooks exist', async () => {
  let installed = false;
  const { bridge, calls } = fakeBridge({
    'hooks status': () =>
      envelope({
        path: '/h/.claude/settings.json',
        installed: true,
        stale: false,
        events: {},
        codex: {
          path: '/h/.codex/hooks.json',
          installed,
          stale: false,
          events: { SessionStart: installed, Stop: installed },
          trusted: { SessionStart: false, Stop: true },
          hint: 'Start Codex and review hooks in Hooks need review.',
        },
      }),
    'hooks install': () => {
      installed = true;
      return envelope({ changed: true });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('codex-hooks-status')[0]?.textContent).toContain('SessionStart: Not installed');
  await click(byTestId('hooks-install')[0]);
  expect(calls).toContainEqual(['--json', 'hooks', 'install']);
  expect(byTestId('codex-hooks-status')[0]?.textContent).toContain('SessionStart: Untrusted');
  expect(byTestId('codex-hooks-status')[0]?.textContent).toContain('Stop: Trusted');
  expect(byTestId('codex-hooks-status')[0]?.textContent).toContain('Hooks need review');
});

test('Doctor installs the missing Antigravity instruction hook', async () => {
  let installed = false;
  const { bridge, calls } = fakeBridge({
    'hooks status': () =>
      envelope({
        path: '/h/.claude/settings.json',
        installed: true,
        stale: false,
        events: {},
        codex: { path: '/h/.codex/hooks.json', installed: true, events: {}, trusted: {}, hint: '' },
        antigravity: {
          path: '/h/.gemini/config/hooks.json',
          installed,
          stale: false,
          events: { PreInvocation: installed },
        },
      }),
    'hooks install': () => {
      installed = true;
      return envelope({ changed: true });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-doctor')[0]);
  expect(byTestId('antigravity-hooks-status')[0]?.textContent).toContain('Not installed');
  await click(byTestId('hooks-install')[0]);
  expect(calls).toContainEqual(['--json', 'hooks', 'install']);
  expect(byTestId('antigravity-hooks-status')[0]?.textContent).toContain('Installed');
});
