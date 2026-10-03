// @vitest-environment happy-dom
import type { Check, Config } from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from '@/app/App';
import {
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  fill,
  renderWithMesa,
  report,
  toastTexts,
} from '@/lib/testing';

const check = (name: string, status: Check['status'], extra: Partial<Check> = {}): Check => ({
  name,
  ok: status === 'ok',
  status,
  hint: '',
  ...extra,
});

/** No profile until `mesa init` succeeds (after `initFailures` refusals); tmux missing until fixed. */
async function setup(options: { initFailures?: number } = {}) {
  let initFailures = options.initFailures ?? 0;
  let profile = false;
  const state = { tmux: false };
  const healthy = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  const missing = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge, calls } = fakeBridge({
    config: () =>
      profile ? envelope({ ...healthy.data, onboarding: { status: 'active', step: 0 } }) : missing,
    projects: () => (profile ? envelope([]) : missing),
    init: () => {
      if (initFailures > 0) {
        initFailures -= 1;
        return failure('Vault folder refused');
      }
      profile = true;
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
              ? check('tmux', 'ok', { version: 'tmux 3.5a' })
              : check('tmux', 'fail', { hint: 'brew install tmux' }),
            check('claude', 'ok', { version: '2.1.0' }),
            check('codex', 'warn', { hint: 'npm i -g @openai/codex' }),
            check('agy', 'warn', { hint: 'install Antigravity' }),
            check('obsidian', 'ok'),
            check('profile dir', 'ok'),
          ],
          state.tmux
            ? { healthy: true, summary: 'ready' }
            : { healthy: false, summary: 'Mesa needs tmux and at least one agent' },
        ),
      ),
    'config set': (args) => envelope({ path: args.at(-2), value: JSON.parse(args.at(-1) ?? '') }),
  });
  const platform = fakePlatform({ folder: '/h/chosen-vault' });
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  return { byTestId, calls, state, platform };
}

const disabled = (element: HTMLElement | undefined) => element?.hasAttribute('disabled');
const rows = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('doctor-row').map((row) => [
    row.querySelector('td')?.textContent,
    row.dataset.status,
    row.querySelectorAll('td')[2]?.textContent || row.querySelectorAll('td')[3]?.textContent,
  ]);

test('with no profile, Set up shows instead of the Board, and Create profile runs mesa init with the vault', async () => {
  const { byTestId, calls } = await setup({ initFailures: 1 });
  expect(byTestId('setup-screen')).toHaveLength(1);
  expect(byTestId('session-start')[0]?.closest('[hidden]')).not.toBeNull();
  expect(byTestId('doctor-row')).toEqual([]);
  expect(disabled(byTestId('setup-create')[0])).toBe(true);
  expect(disabled(byTestId('setup-continue')[0])).toBe(true);
  await fill('setup-vault', '  /h/vault  ');
  expect(disabled(byTestId('setup-create')[0])).toBe(false);
  await click(byTestId('setup-create')[0]);
  expect(calls).toContainEqual(['--json', 'init', '--vault=/h/vault']);
  expect(toastTexts(byTestId)).toContain('Vault folder refused');
  expect(disabled(byTestId('setup-continue')[0])).toBe(true);
  await click(byTestId('setup-create')[0]);
  expect(calls.filter((args) => args[1] === 'init')).toHaveLength(2);
  expect(byTestId('setup-screen')).toHaveLength(1);
  expect(disabled(byTestId('setup-create')[0])).toBe(true);
});

test('Choose fills the vault from the folder picker', async () => {
  const { byTestId, calls } = await setup();
  await click(
    [...document.querySelectorAll<HTMLElement>('[data-testid="setup-screen"] button')].find(
      (button) => button.textContent?.trim() === 'Choose',
    ),
  );
  await click(byTestId('setup-create')[0]);
  expect(calls).toContainEqual(['--json', 'init', '--vault=/h/chosen-vault']);
});

test('once the profile exists, the tmux and agent rows show with a failing tmux, and Recheck reruns doctor', async () => {
  const { byTestId, calls, state } = await setup();
  await fill('setup-vault', '/h/vault');
  await click(byTestId('setup-create')[0]);
  expect(rows(byTestId)).toEqual([
    ['tmux', 'fail', 'brew install tmux'],
    ['claude', 'ok', '2.1.0'],
    ['codex', 'warn', 'npm i -g @openai/codex'],
    ['agy', 'warn', 'install Antigravity'],
  ]);
  expect(byTestId('doctor-summary')[0]?.textContent).toBe('Mesa needs tmux and at least one agent');
  const doctorRuns = calls.filter((args) => args[1] === 'doctor').length;
  state.tmux = true;
  await click(byTestId('setup-recheck')[0]);
  expect(calls.filter((args) => args[1] === 'doctor')).toHaveLength(doctorRuns + 1);
  expect(rows(byTestId)[0]).toEqual(['tmux', 'ok', 'tmux 3.5a']);
  expect(byTestId('doctor-summary')).toEqual([]);
});

test('Copy puts the README link command on the pasteboard', async () => {
  const { byTestId, platform } = await setup();
  const command =
    'mkdir -p ~/.local/bin && ln -s /Applications/Mesa.app/Contents/MacOS/mesa ~/.local/bin/mesa';
  expect(byTestId('setup-link-command')[0]?.textContent).toBe(command);
  await click(byTestId('setup-copy')[0]);
  expect(platform.pasteboard).toEqual([command]);
});

test('Continue, enabled once the profile exists even with doctor unhealthy, opens the tour at step 0', async () => {
  const { byTestId, calls } = await setup();
  await fill('setup-vault', '/h/vault');
  await click(byTestId('setup-create')[0]);
  expect(byTestId('doctor-summary')).toHaveLength(1);
  expect(disabled(byTestId('setup-continue')[0])).toBe(false);
  await click(byTestId('setup-continue')[0]);
  expect(calls).toContainEqual([
    '--json',
    'config',
    'set',
    '--',
    'onboarding',
    JSON.stringify({ status: 'active', step: 0 }),
  ]);
  expect(byTestId('setup-screen')).toEqual([]);
  expect(byTestId('welcome-tour')).toHaveLength(1);
  expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 1 of 3');
});
