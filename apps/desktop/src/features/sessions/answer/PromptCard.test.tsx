// @vitest-environment happy-dom
import type { PendingPrompt } from '@mesa/core';
import { expect, test } from 'vitest';
import {
  asking,
  busy,
  click,
  envelope,
  failure,
  fakeBridge,
  fill,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { PromptCard } from './PromptCard';

const permission: PendingPrompt = {
  status: 'pending',
  session: 'aaaaaaaa',
  id: 'p1',
  kind: 'permission',
  tool: 'Bash',
  summary: 'touch beacon.txt',
  options: [
    { id: 'allow', label: 'Allow' },
    { id: 'deny', label: 'Deny' },
  ],
  freeText: false,
};
const question: PendingPrompt = {
  ...permission,
  id: 'q1',
  kind: 'question',
  tool: 'AskUserQuestion',
  summary: 'Tea or coffee?',
  options: [
    { id: '1', label: 'Tea' },
    { id: '2', label: 'Coffee' },
  ],
  freeText: true,
};
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);

test('a waiting session shows its prompt with options as buttons; Allow answers it and the card closes', async () => {
  const { bridge, calls } = fakeBridge({
    prompt: () => envelope(permission),
    answer: () => envelope({ answered: true, prompt: 'p1', option: 'allow', receipt: null }),
  });
  const byTestId = await renderWithMesa(<PromptCard row={asking} />, bridge);
  const card = byTestId('session-prompt')[0];
  expect(card?.textContent).toContain('Allow Bash?');
  expect(card?.textContent).toContain('touch beacon.txt');
  expect(button('Deny')).toBeDefined();
  await click(button('Allow'));
  expect(calls).toContainEqual([
    '--json',
    'answer',
    '--via',
    'app',
    '--prompt',
    'p1',
    '--',
    'aaaaaaaa',
    'allow',
  ]);
  expect(byTestId('session-prompt')).toHaveLength(0);
});

test('a question takes a typed answer too', async () => {
  const { bridge, calls } = fakeBridge({
    prompt: () => envelope(question),
    answer: () => envelope({ answered: true, prompt: 'q1', receipt: null }),
  });
  const byTestId = await renderWithMesa(<PromptCard row={asking} />, bridge);
  expect(byTestId('session-prompt')[0]?.textContent).toContain('Tea or coffee?');
  const input = document.querySelector<HTMLInputElement>('[aria-label="Type an answer"]');
  await fill(input, 'matcha');
  await click(input?.form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? undefined);
  expect(calls).toContainEqual([
    '--json',
    'answer',
    '--via',
    'app',
    '--prompt',
    'q1',
    '--text',
    'matcha',
    '--',
    'aaaaaaaa',
  ]);
});

test('a stale answer is toasted and the prompt read again; an unqualified one says why', async () => {
  let shown: PendingPrompt = permission;
  const { bridge } = fakeBridge({
    prompt: () => envelope(shown),
    answer: () => {
      shown = { status: 'unsupported', session: 'aaaaaaaa', reason: 'answer it in the pane' };
      return failure('stale answer: session aaaaaaaa now waits on another prompt', 'usage');
    },
  });
  const byTestId = await renderWithMesa(<PromptCard row={asking} />, bridge);
  await click(button('Allow'));
  expect(toastTexts(byTestId)).toContain(
    'stale answer: session aaaaaaaa now waits on another prompt',
  );
  expect(byTestId('session-prompt')[0]?.textContent).toBe('answer it in the pane');
});

test('a session not waiting shows no card and reads nothing', async () => {
  const { bridge, calls } = fakeBridge();
  const byTestId = await renderWithMesa(<PromptCard row={busy} />, bridge);
  expect(byTestId('session-prompt')).toHaveLength(0);
  expect(calls.filter((c) => c[1] === 'prompt')).toEqual([]);
});
