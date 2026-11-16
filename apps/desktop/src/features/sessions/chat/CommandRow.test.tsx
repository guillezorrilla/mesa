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
    command('c1', '/moorings', 'Usage: /moorings key=value\n  berth=one|two\n  dock=true|false'),
  ]);
  expect(document.querySelector('#setting-berth')).not.toBeNull();
  // An on-or-off key with no value read offers both, not a switch that reads as off.
  expect(document.querySelector<HTMLSelectElement>('#setting-dock')?.value).toBe('');
  expect(calls.some((c) => c[2] === 'config')).toBe(false);
});

test('other output stays formatted text', async () => {
  await structuredChat([command('c1', '/compact', 'Compacted.')]);
  expect(card()).toBeUndefined();
  expect(document.querySelector('[data-testid="command-output"]')?.textContent).toContain(
    'Compacted.',
  );
});

test("typing /model opens the footer's model menu, not a card: a number key picks, and the keys go back to the composer", async () => {
  const { calls } = await structuredChat([], {
    'sessions model': () => envelope({ ...controls, model: 'claude-sonnet-5-5', receipt: null }),
  });
  const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Message eeeeeeee"]');
  await fill(field ?? undefined, '/model');
  await press(field ?? undefined, 'Enter');
  expect(sent(calls)).toEqual([]);
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
  expect(items.map((item) => item.textContent)).toEqual(['Sonnet 5.51', 'Haiku 5.52']);
  expect(items[1]?.getAttribute('aria-checked')).toBe('true');
  await press(menu ?? undefined, '1');
  expect(calls).toContainEqual(['--json', 'sessions', 'model', '--', 'eeeeeeee', 'sonnet']);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(field);
});

test('/model with a name stays a row', async () => {
  await structuredChat([command('c1', '/model sonnet', 'Set model to Sonnet 5.5')]);
  expect(card()).toBeUndefined();
});

// Invented numbers in the shape claude 2.1.325's `/usage` and `/context` print in Structured mode.
const USAGE = [
  'You are paying for the harbour with a lantern plan',
  'Current session: 14% used · resets Nov 16 at 2:10pm (Harbour/Time)',
  'Current week (all models): 92% used · resets Nov 22 at 6pm (Harbour/Time)',
  '',
  "What's contributing to your usage?",
  'Last 24h · 594 requests · 24 sessions',
  '  93%  Start fresh when you switch tasks · run /clear',
].join('\n');
const CONTEXT = [
  '## Context Usage',
  '**Model:** claude-haiku-5-5',
  '**Tokens:** 23.1k / 1m (2%)',
  '| Category | Tokens | Percentage |',
  '|----------|--------|------------|',
  '| Messages | 3.1k | 0.3% |',
].join('\n');

test('/usage reads as bars with their resets, the contributors collapsed, the raw text one click away', async () => {
  await structuredChat([command('c1', '/usage', USAGE)]);
  const bars = [...(card()?.querySelectorAll('[role="progressbar"]') ?? [])];
  expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Current session: 14% used',
    'Current week (all models): 92% used',
  ]);
  expect(card()?.textContent).toContain('Resets Nov 16 at 2:10pm (Harbour/Time)');
  const details = card()?.querySelector('details');
  expect(details?.open).toBe(false);
  expect(details?.querySelector('summary')?.textContent).toBe("What's contributing to your usage?");
  const raw = [...(card()?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent === 'Show raw',
  );
  await click(raw);
  expect(card()?.textContent).toContain('Current session: 14% used · resets');
});

test("/context reads as the window used and each category's share", async () => {
  await structuredChat([command('c1', '/context', CONTEXT)]);
  const text = card()?.textContent ?? '';
  expect(text).toContain('2% used');
  expect(text).toContain('23.1k of 1m tokens · Haiku 5.5');
  expect(text).toContain('Messages3.1k0.3%');
});

test('a /usage reply with no limit stays formatted text', async () => {
  await structuredChat([command('c1', '/usage', 'Usage is not available here.')]);
  expect(card()).toBeUndefined();
});
