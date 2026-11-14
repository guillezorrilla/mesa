// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { PHONE_BETA_URL } from '@mesa/core/browser';
import { expect, test } from 'vitest';
import { App } from '@/app/App';
import { click, envelope, fakeBridge, PROJECTS, renderWithMesa } from '@/lib/testing';

const SAVED = ['--json', 'config', 'set', '--', 'onboarding.phoneBeta', '"dismissed"'];

/** The App with the offer `phoneBeta` and a phone paired or not, the offer saved as set. */
async function render(phoneBeta: 'pending' | 'dismissed', paired = false) {
  const base = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  const state = { phoneBeta };
  const { bridge, calls } = fakeBridge({
    config: () =>
      envelope({ ...base, onboarding: { ...base.onboarding, phoneBeta: state.phoneBeta } }),
    'config set': (args) => {
      if (args.at(-2) === 'onboarding.phoneBeta') state.phoneBeta = JSON.parse(args.at(-1) ?? '');
      return envelope({});
    },
    'phone status': () => envelope({ paired }),
    projects: () => envelope(PROJECTS),
  });
  await renderWithMesa(<App />, bridge);
  const dialog = () =>
    document.querySelector<HTMLElement>('[data-testid="phone-beta-dialog"]') ?? undefined;
  return { calls, dialog };
}

const button = (within: HTMLElement | undefined, label: string) =>
  [...(within?.querySelectorAll<HTMLElement>('button, a') ?? [])].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );

test('an unpaired profile is offered the iPhone beta: the form link, its QR, and the pairing step', async () => {
  const { dialog } = await render('pending');
  expect(dialog()?.textContent).toContain('Mesa is on your iPhone');
  expect(button(dialog(), 'Request TestFlight access')?.getAttribute('href')).toBe(PHONE_BETA_URL);
  expect(dialog()?.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  expect(dialog()?.textContent).toContain(
    'press Pair phone in Settings > Phone and scan the QR code',
  );
});

test('Open Settings > Phone saves the offer as dismissed and opens Settings on Phone', async () => {
  const { dialog, calls } = await render('pending');
  await click(button(dialog(), 'Open Settings > Phone'));
  expect(calls).toContainEqual(SAVED);
  expect(
    document.querySelector('[aria-label="Settings categories"] [aria-current="page"]')?.textContent,
  ).toBe('Phone');
  expect(dialog()).toBeUndefined();
});

test('Maybe later saves the offer as dismissed, and a dismissed offer stays gone', async () => {
  const { dialog, calls } = await render('pending');
  await click(button(dialog(), 'Maybe later'));
  expect(dialog()).toBeUndefined();
  expect(calls).toContainEqual(SAVED);

  document.body.innerHTML = '';
  const again = await render('dismissed');
  expect(again.dialog()).toBeUndefined();
});

test('a profile already paired with a phone is not offered the beta', async () => {
  const { dialog, calls } = await render('pending', true);
  expect(calls.some((args) => args[1] === 'phone' && args[2] === 'status')).toBe(true);
  expect(dialog()).toBeUndefined();
});
