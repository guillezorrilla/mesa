// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  click,
  deferred,
  envelope,
  fakeBridge,
  fakePlatform,
  managedRow,
  PROJECTS,
  renderWithMesa,
} from '@/lib/testing';
import { App } from './App';

const response = (text: string, source: string) => ({
  profile: 'default',
  session: 'aaaaaaaa',
  agent: 'claude',
  nativeSessionId: 'invented-native-id',
  source: source.repeat(64),
  revision: 'f'.repeat(64),
  text,
  truncated: false,
});
// Newest first, as `mesa review responses` lists them.
const ROWS = [response('A violet otter.', 'a'), response('An amber heron.', 'b')];

const config = async (messageActions: boolean) => {
  const base = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  return envelope({ ...base, terminal: { ...base.terminal, messageActions } });
};

const setup = async ({ messageActions = true, rows = ROWS } = {}) => {
  const answer = await config(messageActions);
  const { bridge, calls } = fakeBridge({
    config: () => answer,
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    'review responses': () => envelope({ rows, reviews: [], truncated: false }),
  });
  const platform = fakePlatform();
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  const terminal = byTestId('terminal-aaaaaaaa')[0] as HTMLElement;
  return { calls, platform, terminal };
};

const hover = (element: HTMLElement) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }));
  });
const leave = (element: HTMLElement) =>
  act(async () => {
    element.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
    );
  });
const toolbar = () => document.querySelector<HTMLElement>('[aria-label="Latest response actions"]');
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`) ?? undefined;
const responseReads = (calls: string[][]) =>
  calls.filter((args) => args[1] === 'review' && args[2] === 'responses');

test('hovering the terminal shows Copy, which copies the latest response, until it leaves', async () => {
  const { platform, terminal } = await setup();
  expect(toolbar()).toBeNull();
  await hover(terminal);
  expect(toolbar()).not.toBeNull();
  await click(button('Copy latest response'));
  expect(platform.pasteboard).toEqual(['A violet otter.']);
  await leave(terminal);
  expect(toolbar()).toBeNull();
});

test('Review opens the existing response review on the latest response', async () => {
  const { terminal } = await setup();
  await hover(terminal);
  await click(button('Review latest response'));
  const review = document.querySelector('[aria-label="Response review"]') as HTMLElement;
  expect(review).not.toBeNull();
  const text = review.querySelector<HTMLTextAreaElement>('#review-response-text');
  expect(text?.value).toBe('A violet otter.');
  expect(review.textContent).toContain(`claude response ${'a'.repeat(12)}`);
});

test('with terminal.messageActions off, hovering shows no overlay and reads no responses', async () => {
  const { calls, terminal } = await setup({ messageActions: false });
  await hover(terminal);
  expect(toolbar()).toBeNull();
  expect(responseReads(calls)).toEqual([]);
});

test('the overlay hides while the session has no response yet', async () => {
  const { calls, terminal } = await setup({ rows: [] });
  await hover(terminal);
  expect(responseReads(calls)).toHaveLength(1);
  expect(toolbar()).toBeNull();
});

test('the overlay never takes keyboard focus from the terminal', async () => {
  const { platform, terminal } = await setup();
  const input = terminal.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
  act(() => input.focus());
  expect(document.activeElement).toBe(input);
  await hover(terminal);
  expect(document.activeElement).toBe(input);
  for (const label of ['Copy latest response', 'Review latest response']) {
    const action = button(label) as HTMLButtonElement;
    expect(action.tabIndex).toBe(-1);
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => void action.dispatchEvent(press));
    expect(press.defaultPrevented).toBe(true);
  }
  await click(button('Copy latest response'));
  expect(platform.pasteboard).toEqual(['A violet otter.']);
  expect(document.activeElement).toBe(input);
});

test('re-entering shows no actions until the new read answers, so Copy never copies a stale response', async () => {
  const answer = await config(true);
  const second = deferred();
  let reads = 0;
  const { bridge } = fakeBridge({
    config: () => answer,
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    'review responses': () =>
      ++reads === 1 ? envelope({ rows: ROWS, reviews: [], truncated: false }) : second.promise,
  });
  const platform = fakePlatform();
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  const terminal = byTestId('terminal-aaaaaaaa')[0] as HTMLElement;
  await hover(terminal);
  expect(toolbar()).not.toBeNull();
  await leave(terminal);
  await hover(terminal);
  expect(toolbar()).toBeNull();
  await act(async () =>
    second.resolve(
      envelope({ rows: [response('A newer finch.', 'c'), ...ROWS], reviews: [], truncated: false }),
    ),
  );
  await click(button('Copy latest response'));
  expect(platform.pasteboard).toEqual(['A newer finch.']);
});
