// @vitest-environment happy-dom
import type { SessionControls } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, failure, fakeBridge, managedRow, press, renderWithMesa } from '@/lib/testing';
import { SessionControlsPanel } from './SessionControlsPanel';

const row = managedRow('cccccccc', { view: 'structured' });
const controls: SessionControls = {
  session: 'cccccccc',
  agent: 'claude',
  model: 'claude-sonnet-5-5',
  effort: 'high',
  mode: 'manual',
  defaultMode: 'manual',
  defaultModel: 'opus',
  models: ['opus', 'sonnet', 'haiku', 'fable'],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  modes: ['auto', 'manual', 'acceptEdits', 'plan'],
};
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? undefined;
/** Opens a Radix menu the way a pointer does. */
const open = (trigger?: HTMLElement) =>
  act(async () => {
    trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    trigger?.click();
  });
/** The open menu's item whose name reads `label`, its number and badge aside. */
const item = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')].find(
    (i) =>
      i.firstElementChild?.firstElementChild?.firstChild?.textContent === label ||
      i.textContent?.startsWith(label),
  );
/** Opens `trigger`'s menu, then picks the item that reads `label` (in `sub`'s submenu when named). */
async function pick(trigger: HTMLElement | undefined, label: string, sub?: string) {
  await open(trigger);
  if (sub) await open(item(sub));
  await act(async () => item(label)?.click());
}

test('shows the confirmed model, effort and mode by name, and an effort picked goes to the agent', async () => {
  const { bridge, calls } = fakeBridge({
    'sessions controls': () => envelope(controls),
    'sessions model': () => envelope({ ...controls, effort: 'low', receipt: null }),
  });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  expect(button('Model and effort')?.textContent).toBe('Sonnet 5.5High');
  expect(button('Mode')?.textContent).toBe('Manual');
  await pick(button('Model and effort'), 'Low', 'Effort');
  expect(calls).toContainEqual(['--json', 'sessions', 'model', '--effort=low', '--', 'cccccccc']);
  expect(button('Model and effort')?.textContent).toBe('Sonnet 5.5Low');
});

test('the mode menu reads as Claude Desktop: a Mode heading, names, what each does, Default, number keys', async () => {
  const { bridge } = fakeBridge({ 'sessions controls': () => envelope(controls) });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  await open(button('Mode'));
  const menu = document.querySelector('[role="menu"]');
  expect(menu?.textContent).toContain('Mode');
  const rows = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
  expect(rows.map((r) => r.textContent)).toEqual([
    'AutoClaude handles permission decisions1',
    'ManualDefaultAlways ask before making changes2',
    'Accept editsAutomatically accept all file edits3',
    'PlanCreate a plan before making changes4',
  ]);
  expect(rows[1]?.getAttribute('aria-checked')).toBe('true');
});

test("shows the agent's refusal beside the controls", async () => {
  const { bridge } = fakeBridge({
    'sessions controls': () => envelope(controls),
    'sessions mode': () => failure('session cccccccc: no such mode', 'agent_unavailable'),
  });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  await pick(button('Mode'), 'Plan');
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
  await pick(button('Mode'), 'Plan');
  expect(button('Mode')?.textContent).toBe('Plan');
  expect(button('Mode')?.getAttribute('aria-busy')).toBe('true');
  await act(async () => answer(failure('session cccccccc: no such mode', 'agent_unavailable')));
  expect(button('Mode')?.textContent).toBe('Manual');
  expect(button('Mode')?.getAttribute('aria-busy')).toBe('false');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'session cccccccc: no such mode',
  );
});

test("a Codex session's menus: its models by the names it lists, its approval presets, no usage", async () => {
  const codex: SessionControls = {
    session: 'cccccccc',
    agent: 'codex',
    model: 'gpt-invented',
    effort: 'low',
    mode: 'read-only',
    defaultMode: 'read-only',
    defaultModel: 'gpt-invented',
    models: ['gpt-invented', 'gpt-other'],
    modelLabels: { 'gpt-invented': 'Invented', 'gpt-other': 'Other' },
    efforts: ['minimal', 'low', 'high'],
    modes: ['read-only', 'auto'],
  };
  const { bridge, calls } = fakeBridge({
    'sessions controls': () => envelope(codex),
    'sessions mode': () => envelope({ ...codex, mode: 'auto', receipt: null }),
  });
  await renderWithMesa(<SessionControlsPanel row={row} />, bridge);
  expect(button('Model and effort')?.textContent).toBe('InventedLow');
  expect(button('Mode')?.textContent).toBe('Read only');
  expect(button('Usage')).toBeUndefined();
  await open(button('Model and effort'));
  expect(
    [...document.querySelectorAll('[role="menuitemradio"]')].map((r) => r.textContent),
  ).toEqual(['InventedDefault1', 'Other2']);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await open(button('Mode'));
  await press(document.querySelector<HTMLElement>('[role="menu"]') ?? undefined, '2');
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(calls).toContainEqual(['--json', 'sessions', 'mode', '--', 'cccccccc', 'auto']);
  expect(button('Mode')?.textContent).toBe('Auto');
});
