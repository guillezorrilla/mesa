// @vitest-environment happy-dom
import type { ChatItem, SessionControls } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  choose,
  click,
  envelope,
  fakeBridge,
  fakeFollows,
  fakePlatform,
  fill,
  managedRow,
  press,
  renderWithMesa,
} from '@/lib/testing';
import { ChatPanel } from './ChatPanel';

// Invented settings in the shape claude 2.1.325's `/config` prints in Structured mode.
const LIST = [
  'Usage: /config key=value [key=value ...]',
  '  lanternGlow=true|false',
  '  tide=low|high',
  '  harbourName=<value>',
].join('\n');
const command = (id: string, text: string, output?: string): ChatItem => ({
  id,
  at: null,
  text,
  from: 'command',
  ...(output === undefined ? {} : { output }),
});
const row = managedRow('eeeeeeee', { view: 'structured' });
const controls: SessionControls = {
  session: 'eeeeeeee',
  agent: 'claude',
  model: 'claude-haiku-5-5',
  effort: 'low',
  mode: 'default',
  models: ['sonnet', 'haiku', 'opusplan'],
  efforts: ['low', 'high'],
  modes: ['default'],
};

/** A Structured chat on a fake follow, showing `items`; `push` adds one more as the host would. */
async function structuredChat(items: ChatItem[], replies: Record<string, unknown> = {}) {
  const follows = fakeFollows();
  const { bridge, calls } = fakeBridge({
    'sessions controls': () => envelope(controls),
    'sessions config': () => envelope({ lanternGlow: 'false', tide: 'high' }),
    send: () => envelope({ id: 'eeeeeeee', receipt: null }),
    ...replies,
  });
  await renderWithMesa(
    <ChatPanel sessionId="eeeeeeee" row={row} acting={false} onSend={() => {}} />,
    bridge,
    fakePlatform({ follow: follows.host }),
  );
  await act(async () =>
    follows.push({ type: 'chat', messages: items, count: items.length, more: false }),
  );
  await act(async () => new Promise((done) => setTimeout(done, 0)));
  const push = (item: ChatItem) => act(async () => follows.push({ type: 'item', item }));
  return { calls, push };
}
const card = () => document.querySelector<HTMLElement>('[data-testid="command-card"]') ?? undefined;
const sent = (calls: string[][]) => calls.filter((c) => c[1] === 'send').map((c) => c.at(-1));

test('/config opens a settings form: grouped, current values read, a change sent and confirmed', async () => {
  const { calls, push } = await structuredChat([command('c1', '/config', LIST)]);
  expect(calls).toContainEqual([
    '--json',
    'sessions',
    'config',
    '--',
    'eeeeeeee',
    'lanternGlow',
    'tide',
    'harbourName',
  ]);
  const text = card()?.textContent ?? '';
  expect(text).toContain('On or off');
  expect(text).toContain('Choices');
  expect(text).toContain('Values');
  const glow = document.querySelector<HTMLElement>('#setting-lanternGlow');
  expect(glow?.getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector<HTMLSelectElement>('#setting-tide')?.value).toBe('high');
  await click(glow ?? undefined);
  expect(sent(calls)).toEqual(['/config lanternGlow=true']);
  expect(card()?.querySelector('[role="status"]')?.textContent).toBe('Setting lanternGlow to true');
  await push(command('c2', '/config lanternGlow=true', 'Lantern glow set to true'));
  // The reply shows in the card, not as a row of its own.
  expect(card()?.querySelector('[role="status"]')?.textContent).toBe(
    'lanternGlow=true: Lantern glow set to true',
  );
  expect(document.querySelectorAll('[data-testid="command-output"]')).toHaveLength(0);
  await choose(document.querySelector<HTMLElement>('#setting-tide') ?? undefined, 'low');
  expect(sent(calls).at(-1)).toBe('/config tide=low');
});

test('a command sent from the composer opens as its card once its output arrives', async () => {
  const { push } = await structuredChat([]);
  await push(command('c1', '/config'));
  expect(card()).toBeUndefined();
  await push(command('c1', '/config', LIST));
  expect(document.querySelector('#setting-lanternGlow')).not.toBeNull();
});

test('search narrows the keys, Show raw gives the text back, Escape closes and refocuses the composer', async () => {
  await structuredChat([command('c1', '/config', LIST)]);
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search /config settings"]');
  if (!search) throw new Error('no search');
  await fill(search, 'tide');
  expect(document.querySelector('#setting-lanternGlow')).toBeNull();
  expect(document.querySelector('#setting-tide')).not.toBeNull();
  const raw = [...(card()?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent === 'Show raw',
  );
  await click(raw);
  expect(card()?.textContent).toContain('lanternGlow=true|false');
  await press(card(), 'Escape');
  expect(card()).toBeUndefined();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Message eeeeeeee');
});

test('Down moves from the search to the first control', async () => {
  await structuredChat([command('c1', '/config', LIST)]);
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search /config settings"]');
  search?.focus();
  await press(search, 'ArrowDown');
  expect(document.activeElement?.id).toBe('setting-lanternGlow');
});

test('a free value is sent on Enter', async () => {
  const { calls } = await structuredChat([command('c1', '/config', LIST)]);
  const name = document.querySelector<HTMLInputElement>('#setting-harbourName');
  if (!name) throw new Error('no field');
  name.value = 'Cove';
  await press(name, 'Enter');
  expect(sent(calls)).toEqual(['/config harbourName=Cove']);
});

test("another built-in's key=value list gets the same form, with no values to read", async () => {
  const { calls } = await structuredChat([
    command('c1', '/moorings', 'Usage: /moorings key=value\n  berth=one|two'),
  ]);
  expect(document.querySelector('#setting-berth')).not.toBeNull();
  expect(calls.some((c) => c[2] === 'config')).toBe(false);
});

test('other output stays formatted text', async () => {
  await structuredChat([command('c1', '/compact', 'Compacted.')]);
  expect(card()).toBeUndefined();
  expect(document.querySelector('[data-testid="command-output"]')?.textContent).toContain(
    'Compacted.',
  );
});

test("/model opens the footer's model list as a card: the current one checked, a pick applied", async () => {
  const { calls } = await structuredChat([command('c1', '/model', 'Current model: `Haiku 5.5`')], {
    'sessions model': () => envelope({ ...controls, model: 'claude-sonnet-5-5', receipt: null }),
  });
  const options = [...(card()?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
  expect(options.map((o) => o.textContent)).toEqual(['sonnet', 'haiku', 'opusplan', 'low', 'high']);
  expect(options.find((o) => o.textContent === 'haiku')?.getAttribute('aria-checked')).toBe('true');
  await click(options[0]);
  expect(calls).toContainEqual(['--json', 'sessions', 'model', '--', 'eeeeeeee', 'sonnet']);
  expect(card()?.querySelector('[role="status"]')?.textContent).toBe('Now Sonnet 5.5, low effort');
});

test('/model with a name stays a row', async () => {
  await structuredChat([command('c1', '/model sonnet', 'Set model to Sonnet 5.5')]);
  expect(card()).toBeUndefined();
});
