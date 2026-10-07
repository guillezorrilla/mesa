// @vitest-environment happy-dom
import type { Config, KeyRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, failure, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { SettingsDialog } from './SettingsDialog';

const KEY = 'ts-test-0000-1111-abcd';

/**
 * Settings on Smarter decisions over a bridge holding the keys and the chosen model; `reject`
 * makes the next key set fail as a refused key does. The key each set read on stdin is kept.
 */
async function render(options: { reject?: boolean } = {}) {
  const state = {
    model: 'none' as Config['decisions']['model'],
    keys: [
      { provider: 'typesafe', set: false },
      { provider: 'cloudflare', set: false },
    ] as KeyRow[],
    stdin: [] as (string | undefined)[],
  };
  const fake = fakeBridge();
  const base = ((await fake.bridge(['--json', 'config'])) as { data: Config }).data;
  const { bridge, calls } = fakeBridge({
    config: () => envelope({ ...base, decisions: { ...base.decisions, model: state.model } }),
    'decisions key list': () => envelope({ keys: state.keys }),
    'decisions key set': (_args, stdin) => {
      state.stdin.push(stdin);
      if (options.reject)
        return failure('Jev rejected the key (HTTP 401); the key was not saved', 'invalid_config');
      const key = {
        provider: 'typesafe',
        set: true,
        addedAt: '2026-09-24T12:00:00.000Z',
        last4: 'abcd',
      } as KeyRow;
      state.keys = [key, state.keys[1] as KeyRow];
      state.model = 'jev';
      return envelope({ key, model: 'jev' });
    },
    'decisions key remove': () => {
      state.keys = [{ provider: 'typesafe', set: false }, state.keys[1] as KeyRow];
      state.model = 'none';
      return envelope({ provider: 'typesafe', removed: true, model: 'none' });
    },
  });
  await renderWithMesa(
    <SettingsDialog
      open
      onOpenChange={() => {}}
      category="decisions"
      doctorBusy={false}
      onRecheck={() => {}}
      onNavigate={() => {}}
      onReplayTour={() => {}}
      onChanged={() => {}}
    />,
    bridge,
  );
  return { state, calls };
}

const section = (title: string) =>
  document.querySelector<HTMLElement>(`section[aria-label="${title}"]`);
const keyField = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="TypeSafe API key"]');
const button = (within: HTMLElement | null, label: string) =>
  [...(within?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === label,
  );

test('the Jev, CLEF and None cards say what each model improves, costs and sends, and list each site', async () => {
  await render();
  const jev = section('Jev')?.textContent ?? '';
  expect(jev).toContain("Sharper answers when Faro's rules are unsure");
  expect(jev).toContain('Paid per input token: $0.042 per million.');
  expect(jev).toContain('The session text and the questions go to TypeSafe.');
  expect(section('Jev')?.querySelector('a')?.getAttribute('href')).toBe(
    'https://console.typesafe.ai/keys',
  );
  const clef = section('CLEF')?.textContent ?? '';
  expect(clef).toContain(
    'Free up to 10,000 Neurons a day, about 450k input tokens on clef; then $0.24 per M on Workers Paid.',
  );
  expect(clef).toContain('The session text and the questions go to Cloudflare.');
  expect(clef).toContain('Workers AI access');
  expect(
    section('CLEF')?.querySelector('input[aria-label="Cloudflare account ID"]'),
  ).not.toBeNull();
  // Every site passed the held-out check for Jev (PASSED_GATE, #638), so each is active.
  expect(document.querySelector('[data-testid="jev-sites"]')?.textContent).toBe(
    [
      'Session state: active',
      'Source relevance: active',
      'Next step: active',
      'Completion evidence: active',
    ].join(''),
  );
  expect(section('None')?.textContent).toContain('In use');
});

test('Test and save sends the key on stdin, clears the field, and then shows only its last 4', async () => {
  const { state, calls } = await render();
  const field = keyField();
  expect(field?.type).toBe('password');
  await fill(field?.id ?? '', KEY);
  await click(button(section('Jev'), 'Test and save'));
  expect(state.stdin).toEqual([KEY]);
  expect(calls).toContainEqual(['--json', 'decisions', 'key', 'set', '--', 'typesafe']);
  expect(calls.flat().join(' ')).not.toContain(KEY);
  expect(keyField()).toBeNull();
  const jev = section('Jev');
  expect(jev?.textContent).toContain('Set, ending in abcd, added 2026-09-24');
  expect(jev?.textContent).not.toContain(KEY);
  expect(jev?.textContent).toContain('In use');
  expect(button(jev, 'Replace')).toBeDefined();
  expect(button(section('None'), 'Use this one')).toBeDefined();

  await click(button(jev, 'Replace'));
  expect(keyField()?.value).toBe('');
  await click(button(section('Jev'), 'Cancel'));
  await click(button(section('Jev'), 'Remove'));
  expect(calls).toContainEqual(['--json', 'decisions', 'key', 'remove', '--', 'typesafe']);
  expect(keyField()).not.toBeNull();
  expect(section('None')?.textContent).toContain('In use');
});

test('a rejected key says key rejected, links to the TypeSafe console, and leaves the field empty', async () => {
  const { state } = await render({ reject: true });
  await fill(keyField()?.id ?? '', KEY);
  await click(button(section('Jev'), 'Test and save'));
  expect(state.stdin).toEqual([KEY]);
  const alert = section('Jev')?.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(
    'Key rejected. Jev rejected the key (HTTP 401); the key was not saved. Check the key and your TypeSafe sign-up at console.typesafe.ai/keys.',
  );
  expect(alert?.querySelector('a')?.getAttribute('href')).toBe('https://console.typesafe.ai/keys');
  expect(keyField()?.value).toBe('');
});
