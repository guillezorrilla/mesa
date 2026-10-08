// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { expect, test } from 'vitest';
import { App } from '@/app/App';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';

/** The App on the Sessions view with `model` chosen and the tip `decisionTip`, saved as set. */
async function render(model: Config['decisions']['model'], decisionTip: 'pending' | 'dismissed') {
  const base = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  const state = { decisionTip };
  const { bridge, calls } = fakeBridge({
    config: () =>
      envelope({
        ...base,
        decisions: { ...base.decisions, model },
        onboarding: { ...base.onboarding, decisionTip: state.decisionTip },
      }),
    'config set': (args) => {
      if (args.at(-2) === 'onboarding.decisionTip')
        state.decisionTip = JSON.parse(args.at(-1) ?? '');
      return envelope({});
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  return { byTestId, calls, tip: () => byTestId('smarter-decisions-tip')[0] };
}

const button = (within: HTMLElement | undefined, label: string) =>
  [...(within?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );

test('with no Decision model the workspace tip shows, and Set up opens Smarter decisions', async () => {
  const { tip } = await render('none', 'pending');
  expect(tip()?.textContent).toContain(
    'Connect a free decision model so each session gets the right project notes at the right time.',
  );
  await click(button(tip(), 'Set up'));
  expect(
    document.querySelector('[aria-label="Settings categories"] [aria-current="page"]')?.textContent,
  ).toBe('Smarter decisions');
});

test('closing the tip saves it as dismissed, and a dismissed tip stays gone', async () => {
  const { tip, calls } = await render('none', 'pending');
  expect(tip()).toBeDefined();
  await click(button(tip(), 'Close tip'));
  expect(tip()).toBeUndefined();
  expect(calls).toContainEqual([
    '--json',
    'config',
    'set',
    '--',
    'onboarding.decisionTip',
    '"dismissed"',
  ]);

  document.body.innerHTML = '';
  const again = await render('none', 'dismissed');
  expect(again.tip()).toBeUndefined();
});

test('the tip is gone once a Decision model is set', async () => {
  const { tip } = await render('clef', 'pending');
  expect(tip()).toBeUndefined();
});
