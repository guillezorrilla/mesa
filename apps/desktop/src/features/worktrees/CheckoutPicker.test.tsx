// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { CheckoutPicker } from './CheckoutPicker';

const rows = [
  {
    path: '/h/.mesa/default/worktrees/lantern-cove/skiff',
    main: false,
    state: 'ready',
    holders: [],
  },
  { path: '/h/src/lantern-cove', main: true, state: 'ready', holders: [], operation: 'rebase' },
  {
    path: '/h/.mesa/default/worktrees/lantern-cove/gone',
    main: false,
    state: 'stale',
    holders: [],
  },
];

async function picker(value: string) {
  const picked: string[] = [];
  const { bridge } = fakeBridge({ 'worktrees list': () => envelope(rows) });
  await renderWithMesa(
    <CheckoutPicker
      project="lantern-cove"
      label="Checkout"
      value={value}
      onChange={(path) => picked.push(path)}
    />,
    bridge,
  );
  const select = document.querySelector<HTMLSelectElement>('select[aria-label="Checkout"]');
  return { select, picked };
}

test('the picker lists the main checkout first, each by folder, marking one stopped mid-operation', async () => {
  const { select, picked } = await picker('');
  expect([...(select?.options ?? [])].map((option) => [option.value, option.text])).toEqual([
    ['', 'Main checkout (rebase in progress)'],
    ['/h/.mesa/default/worktrees/lantern-cove/skiff', 'skiff'],
  ]);
  await act(async () => {
    if (!select) return;
    select.value = '/h/.mesa/default/worktrees/lantern-cove/skiff';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(picked).toEqual(['/h/.mesa/default/worktrees/lantern-cove/skiff']);
});

test('its label is the selected checkout folder name', async () => {
  const { select } = await picker('/h/.mesa/default/worktrees/lantern-cove/skiff');
  expect(select?.selectedOptions[0]?.text).toBe('skiff');
  expect(select?.closest('[title]')?.getAttribute('title')).toBe(
    '/h/.mesa/default/worktrees/lantern-cove/skiff',
  );
});
