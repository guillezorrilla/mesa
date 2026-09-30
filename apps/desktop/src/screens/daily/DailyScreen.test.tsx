// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { DailyScreen } from './DailyScreen';

test('Daily reads and follows exact Vault links, rebuilding only explicitly for the chosen local day', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  try {
    const onVaultItem = vi.fn();
    const { bridge, calls } = fakeBridge({
      'vault list': () => envelope({ vault: '/h/vault', total: 0, items: [] }),
      'vault read': (args) =>
        envelope({
          path: args.at(-1),
          preview: 'markdown',
          frontmatter: { type: 'daily' },
          body: '## Decisions\n\n[[wiki/tide]]\n',
          links: [
            {
              syntax: 'wikilink',
              text: '[[wiki/tide]]',
              target: 'wiki/tide',
              start: 14,
              end: 27,
              status: 'resolved',
              path: 'wiki/tide.md',
              embed: false,
            },
          ],
          backlinks: [],
        }),
      daily: () =>
        envelope({
          path: 'daily/2026-09-23.md',
          date: '2026-09-23',
          changed: true,
          decisions: 1,
          changes: 0,
          log: 0,
        }),
      'vault open': () => envelope({}),
    });
    const byTestId = await renderWithMesa(<DailyScreen onVaultItem={onVaultItem} />, bridge);
    expect(document.querySelector<HTMLInputElement>('#daily-date')?.value).toBe('2026-09-24');
    expect(calls.some((c) => c[1] === 'daily')).toBe(false);
    await click(byTestId('vault-link')[0]);
    expect(onVaultItem).toHaveBeenCalledWith('wiki/tide.md');
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(calls.some((c) => c[1] === 'daily')).toBe(false);
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('#daily-date');
      if (!input) throw new Error('Daily date input is missing');
      input.value = '2026-09-23';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byTestId('daily-rebuild')[0]);
    expect(calls.filter((c) => c[1] === 'daily')).toEqual([
      ['--json', 'daily', '--date', '2026-09-23'],
    ]);
    expect(calls.filter((c) => c[1] === 'vault' && c[2] === 'read').at(-1)).toEqual([
      '--json',
      'vault',
      'read',
      '--',
      'daily/2026-09-23.md',
    ]);
    const open = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open in Obsidian'),
    );
    if (!open) throw new Error('Open in Obsidian is missing');
    await click(open);
    expect(calls.filter((c) => c[1] === 'vault' && c[2] === 'open')).toEqual([
      ['--json', 'vault', 'open', '--', 'daily/2026-09-23.md'],
    ]);
  } finally {
    vi.useRealTimers();
  }
});
