// @vitest-environment happy-dom
import type { Config, KeyProvider, KeyRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, failure, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import type { SettingsCategory } from './categories';
import { SettingsDialog } from './SettingsDialog';

const KEY = 'ts-test-0000-1111-abcd';
const MODEL_OF = { typesafe: 'jev', cloudflare: 'clef' } as const;

/**
 * Settings on `category` (Smarter decisions) over a bridge holding the keys, the chosen model and
 * the Cloudflare account ID; `reject` makes every key set fail as a refused key does. The key
 * each set read on stdin is kept.
 */
async function render(
  options: {
    reject?: boolean;
    category?: SettingsCategory;
    keys?: KeyRow[];
    account?: string;
  } = {},
) {
  const state = {
    model: 'none' as Config['decisions']['model'],
    account: options.account,
    keys: options.keys ?? [
      { provider: 'typesafe', set: false },
      { provider: 'cloudflare', set: false },
    ],
    stdin: [] as (string | undefined)[],
  };
  const fake = fakeBridge();
  const base = ((await fake.bridge(['--json', 'config'])) as { data: Config }).data;
  const setKey = (provider: KeyProvider, row: KeyRow) => {
    state.keys = state.keys.map((key) => (key.provider === provider ? row : key));
  };
  const { bridge, calls } = fakeBridge({
    config: () =>
      envelope({
        ...base,
        decisions: { ...base.decisions, model: state.model, cloudflareAccount: state.account },
      }),
    'decisions key list': () => envelope({ keys: state.keys }),
    'decisions key set': (args, stdin) => {
      state.stdin.push(stdin);
      if (options.reject)
        return failure('Jev rejected the key (HTTP 401); the key was not saved', 'invalid_config');
      const provider = args.at(-1) as KeyProvider;
      const account = args.indexOf('--account');
      if (account > 0) state.account = args[account + 1];
      const key = { provider, set: true, addedAt: '2026-09-24T12:00:00.000Z', last4: 'abcd' };
      setKey(provider, key);
      if (state.model === 'none') state.model = MODEL_OF[provider];
      return envelope({ key, model: state.model });
    },
    'decisions key remove': (args) => {
      const provider = args.at(-1) as KeyProvider;
      setKey(provider, { provider, set: false });
      if (state.model === MODEL_OF[provider]) state.model = 'none';
      return envelope({ provider, removed: true, model: state.model });
    },
    'decisions use': (args) => {
      state.model = args.at(-1) as Config['decisions']['model'];
      return envelope({ model: state.model, changed: true });
    },
  });
  await renderWithMesa(
    <SettingsDialog
      open
      onOpenChange={() => {}}
      category={options.category ?? 'decisions'}
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

const rows = () => [
  ...document.querySelectorAll<HTMLElement>(
    'section[aria-label="Decision models"] [data-setting-row]',
  ),
];
const row = (name: string) => rows().find((r) => r.querySelector('label')?.textContent === name);
const button = (within: Element | null | undefined, label: string) =>
  [...(within?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === label,
  );
const dialog = (model: string) => document.querySelector(`[data-testid="connect-${model}"]`);
/** The input a dialog's visible label names. */
const field = (model: string, label: string) => {
  const named = [...(dialog(model)?.querySelectorAll('label') ?? [])].find(
    (l) => l.textContent === label,
  );
  return document.getElementById(named?.htmlFor ?? '') as HTMLInputElement | null;
};
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === label,
  );

test('one row per model, CLEF first: its status and cost, Connect, and how it performed folded away', async () => {
  await render();
  expect(rows().map((r) => r.querySelector('label')?.textContent)).toEqual([
    'CLEF (Cloudflare)',
    'Jev (TypeSafe)',
  ]);
  expect(row('CLEF (Cloudflare)')?.textContent).toContain('Not connected · free daily allowance');
  expect(row('Jev (TypeSafe)')?.textContent).toContain(
    'Not connected · about $0.04 per million tokens',
  );
  expect(button(row('CLEF (Cloudflare)'), 'Connect')).toBeDefined();
  expect(button(row('Jev (TypeSafe)'), 'Connect')).toBeDefined();
  // No field on the page itself: the key goes in the Connect dialog.
  expect(document.querySelector('section[aria-label="Decision models"] input')).toBeNull();
  expect(document.querySelector('[data-testid="decisions-rules-only"]')?.textContent).toBe(
    'No model in use: Mesa decides with its own rules.',
  );
  const performed = row('Jev (TypeSafe)')?.querySelector('details');
  expect(performed?.open).toBe(false);
  expect(performed?.querySelector('summary')?.textContent).toBe('How it performed');
  // Every site passed the held-out check for Jev (#638), none the paired workflows yet (#465): no
  // site is automatic, and each shows what it measured.
  const notPaired = 'Paired workflows: not measured.';
  expect(document.querySelector('[data-testid="jev-sites"]')?.textContent).toBe(
    [
      `Session state: offQuality: 100% right where it answered, on 87% of 30 held-out cases. ${notPaired}`,
      'Source relevance: automaticQuality: 100% right where it answered, on 93% of 30 held-out cases. Paired workflows: 12 of 12 tasks solved against 0 of 12 without, 18 s against unbounded per solved task (passed).',
      `Next step: on demandQuality: 100% right where it answered, on 97% of 30 held-out cases. ${notPaired}`,
      `Completion evidence: on demandQuality: 100% right where it answered, on 87% of 30 held-out cases. ${notPaired}`,
    ].join(''),
  );
});

test('Connect CLEF labels the account ID and the token, sends the token on stdin, clears it and closes', async () => {
  const { state, calls } = await render();
  await click(button(row('CLEF (Cloudflare)'), 'Connect'));
  const connect = dialog('clef');
  expect(connect?.querySelector('h2')?.textContent).toBe('Connect CLEF');
  expect(connect?.textContent).toContain(
    'On the Cloudflare dashboard: Workers AI > Use REST API > Account ID.',
  );
  expect(connect?.textContent).toContain(
    'Create a Workers AI API token there and paste it; it is kept only in the macOS Keychain.',
  );
  expect(connect?.textContent).toContain('Free up to 10,000 Neurons a day');
  expect(connect?.textContent).toContain('The session text and the questions go to Cloudflare.');
  expect(connect?.querySelector('a')?.getAttribute('href')).toBe('https://dash.cloudflare.com/');
  const token = field('clef', 'API token');
  expect(token?.type).toBe('password');
  expect(token?.getAttribute('aria-describedby')).toBeTruthy();
  const submit = () =>
    document.querySelector<HTMLButtonElement>('[data-testid="connect-clef-submit"]');
  expect(submit()?.disabled).toBe(true);
  await fill(token?.id ?? '', KEY);
  // The account ID is needed too.
  expect(submit()?.disabled).toBe(true);
  await fill(field('clef', 'Account ID')?.id ?? '', 'acc-123');
  await click(submit() ?? undefined);
  expect(state.stdin).toEqual([KEY]);
  expect(calls).toContainEqual([
    '--json',
    'decisions',
    'key',
    'set',
    '--account',
    'acc-123',
    '--',
    'cloudflare',
  ]);
  expect(calls.flat().join(' ')).not.toContain(KEY);
  expect(dialog('clef')).toBeNull();
  const clef = row('CLEF (Cloudflare)');
  expect(clef?.textContent).toContain('In use · token ending abcd');
  expect(clef?.textContent).not.toContain(KEY);
  expect(button(clef, 'Connect')).toBeUndefined();
  expect(document.querySelector('[data-testid="decisions-rules-only"]')).toBeNull();
});

test('a rejected key says so in place with the provider message, empties the field, and stays open', async () => {
  const { state } = await render({ reject: true });
  await click(button(row('Jev (TypeSafe)'), 'Connect'));
  expect(dialog('jev')?.querySelector('h2')?.textContent).toBe('Connect Jev');
  expect(dialog('jev')?.querySelector('a')?.getAttribute('href')).toBe(
    'https://console.typesafe.ai/keys',
  );
  expect(field('jev', 'Account ID')).toBeNull();
  await fill(field('jev', 'API key')?.id ?? '', KEY);
  await click(
    document.querySelector<HTMLElement>('[data-testid="connect-jev-submit"]') ?? undefined,
  );
  expect(state.stdin).toEqual([KEY]);
  expect(dialog('jev')?.querySelector('[role="alert"]')?.textContent).toBe(
    'That key was rejected. Jev rejected the key (HTTP 401); the key was not saved.',
  );
  expect(field('jev', 'API key')?.value).toBe('');
  expect(row('Jev (TypeSafe)')?.textContent).toContain('Not connected');
});

test('a connected model offers Use, then Replace, Stop using and Disconnect in its menu', async () => {
  const { calls } = await render({
    keys: [
      { provider: 'typesafe', set: false },
      { provider: 'cloudflare', set: true, last4: '1234' },
    ],
  });
  const clef = () => row('CLEF (Cloudflare)');
  expect(clef()?.textContent).toContain('Connected · token ending 1234');
  await click(button(clef(), 'Use'));
  expect(calls).toContainEqual(['--json', 'decisions', 'use', '--', 'clef']);
  expect(clef()?.textContent).toContain('In use · token ending 1234');
  expect(button(clef(), 'Use')).toBeUndefined();

  const menu = () => clef()?.querySelector<HTMLElement>('[aria-label="CLEF actions"]') ?? undefined;
  await click(menu());
  expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual([
    'Replace token',
    'Stop using',
    'Disconnect',
  ]);
  await click(menuItem('Stop using'));
  expect(calls).toContainEqual(['--json', 'decisions', 'use', '--', 'none']);
  expect(clef()?.textContent).toContain('Connected · token ending 1234');

  await click(menu());
  await click(menuItem('Disconnect'));
  expect(calls).toContainEqual(['--json', 'decisions', 'key', 'remove', '--', 'cloudflare']);
  expect(clef()?.textContent).toContain('Not connected · free daily allowance');
});

test('Replace reuses the Connect dialog with the account ID prefilled and labelled', async () => {
  const { calls } = await render({
    keys: [
      { provider: 'typesafe', set: false },
      { provider: 'cloudflare', set: true, last4: '1234' },
    ],
    account: 'acc-123',
  });
  await click(
    row('CLEF (Cloudflare)')?.querySelector<HTMLElement>('[aria-label="CLEF actions"]') ??
      undefined,
  );
  await click(menuItem('Replace token'));
  expect(dialog('clef')?.querySelector('h2')?.textContent).toBe('Replace the CLEF token');
  expect(field('clef', 'Account ID')?.value).toBe('acc-123');
  expect(field('clef', 'API token')?.value).toBe('');
  expect(calls.some((c) => c.includes('set'))).toBe(false);
});

test('Advanced holds the experimental switch, worded plainly', async () => {
  const { calls } = await render({ category: 'advanced' });
  const toggle = document.querySelector<HTMLButtonElement>('#decisions-experimental');
  expect(toggle?.getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('label[for="decisions-experimental"]')?.textContent).toBe(
    'Try unproven automatic decisions',
  );
  await click(toggle ?? undefined);
  expect(calls).toContainEqual(['--json', 'config', 'set', '--', 'decisions.experimental', 'true']);
});
