// @vitest-environment happy-dom
import type { SessionControls } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, failure, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { SessionControlsPanel } from './SessionControlsPanel';

const row = managedRow('cccccccc', { view: 'structured' });
const controls: SessionControls = {
  session: 'cccccccc',
  agent: 'claude',
  model: 'claude-sonnet-5-5',
  effort: 'high',
  mode: 'default',
  models: ['opus', 'sonnet', 'haiku', 'fable'],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  modes: ['default', 'plan'],
};
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? undefined;
/** Opens a Radix menu or popover the way a pointer does, then picks the item that reads `text`. */
async function pick(trigger: HTMLElement | undefined, text: string) {
  await act(async () => {
    trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    trigger?.click();
  });
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"], [role="option"]'),
  ].find((i) => i.textContent === text);
  await act(async () => item?.click());
}

test('shows the confirmed model, effort and mode, and an effort picked goes to the agent', async () => {
  const { bridge, calls } = fakeBridge({
    'sessions controls': () => envelope(controls),
    'sessions model': () => envelope({ ...controls, effort: 'low', receipt: null }),
  });
  const byTestId = await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  const bar = byTestId('session-controls')[0];
  expect(bar?.textContent).toContain('Sonnet 5.5');
  expect(bar?.textContent).toContain('high');
  expect(bar?.textContent).toContain('default');
  await pick(button('Model and effort'), 'low');
  expect(calls).toContainEqual(['--json', 'sessions', 'model', '--effort=low', '--', 'cccccccc']);
  expect(byTestId('session-controls')[0]?.textContent).toContain('low');
});

test("shows the agent's refusal beside the controls", async () => {
  const { bridge } = fakeBridge({
    'sessions controls': () => envelope(controls),
    'sessions mode': () => failure('session cccccccc: no such mode', 'agent_unavailable'),
  });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  await pick(button('Permission mode'), 'plan');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'session cccccccc: no such mode',
  );
});

test("the usage popover shows the last /usage reply's limits as bars", async () => {
  const { bridge } = fakeBridge({
    'sessions controls': () =>
      envelope({ ...controls, usage: 'Current session: 14% used · resets Nov 16 at 2pm' }),
  });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  await act(async () => button('Usage')?.click());
  expect(
    document
      .querySelector('[data-testid="usage-panel"] [role="progressbar"]')
      ?.getAttribute('aria-label'),
  ).toBe('Current session: 14% used');
});

test('a pick shows at once with a spinner, and rolls back with the refusal', async () => {
  let answer: (value: unknown) => void = () => undefined;
  const { bridge } = fakeBridge({
    'sessions controls': () => envelope(controls),
    'sessions mode': () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  await pick(button('Permission mode'), 'plan');
  expect(button('Permission mode')?.textContent).toBe('plan');
  expect(button('Permission mode')?.getAttribute('aria-busy')).toBe('true');
  await act(async () => answer(failure('session cccccccc: no such mode', 'agent_unavailable')));
  expect(button('Permission mode')?.textContent).toBe('default');
  expect(button('Permission mode')?.getAttribute('aria-busy')).toBe('false');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'session cccccccc: no such mode',
  );
});
