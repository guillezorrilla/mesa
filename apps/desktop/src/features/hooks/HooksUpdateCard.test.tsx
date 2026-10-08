// @vitest-environment happy-dom
import type { HooksStatus } from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from '@/app/App';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';

const REVIEW =
  'The next Codex start asks you to review hooks: choose "Review hooks" in "Hooks need review" and trust Mesa\'s entries.';

/**
 * The App on the Sessions view over hooks that `needsUpdate` (until installed), where an install
 * changes Codex's hook commands when `codexChanged`.
 */
async function render(needsUpdate: boolean, codexChanged = false) {
  const healthy = (await fakeBridge().bridge(['--json', 'hooks', 'status'])) as {
    data: HooksStatus;
  };
  const state = { needsUpdate };
  const { bridge, calls } = fakeBridge({
    'hooks status': () => envelope({ ...healthy.data, needsUpdate: state.needsUpdate }),
    'hooks install': () => {
      state.needsUpdate = false;
      return envelope({
        changed: true,
        codex: { changed: codexChanged, hint: codexChanged ? REVIEW : '' },
        receipt: null,
      });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  return {
    calls,
    card: () => byTestId('hooks-update-card')[0],
    note: () => byTestId('codex-review-note')[0],
  };
}

const button = (within: HTMLElement | undefined, label: string) =>
  [...(within?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );

test('hooks that need an update show the card; Update hooks installs them and it goes', async () => {
  const { card, note, calls } = await render(true);
  expect(card()?.textContent).toContain("Mesa's session hooks need an update");
  await click(button(card(), 'Update hooks'));
  expect(calls.some((args) => args[1] === 'hooks' && args[2] === 'install')).toBe(true);
  expect(card()).toBeUndefined();
  // Codex's hooks did not change, so there is nothing to approve.
  expect(note()).toBeUndefined();
});

test('no card for hooks never installed or current ones (needsUpdate false)', async () => {
  const { card } = await render(false);
  expect(card()).toBeUndefined();
});

test('closing the card hides it', async () => {
  const { card } = await render(true);
  await click(button(card(), 'Close notice'));
  expect(card()).toBeUndefined();
});

test("an update that changed Codex's hooks says once how to approve them in Codex", async () => {
  const { card, note } = await render(true, true);
  await click(button(card(), 'Update hooks'));
  expect(note()?.textContent).toContain("Codex needs you to approve Mesa's updated hooks");
  expect(note()?.textContent).toContain(REVIEW);
  await click(button(note(), 'Close note'));
  expect(note()).toBeUndefined();
  expect(card()).toBeUndefined();
});
