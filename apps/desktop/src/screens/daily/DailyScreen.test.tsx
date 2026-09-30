// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test, vi } from 'vitest';
import type { Bridge } from '@/lib/client';
import { MesaRoot } from '@/lib/MesaRoot';
import {
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
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

const readDaily = (body: string) => (args: string[]) =>
  envelope({
    path: args.at(-1),
    preview: 'markdown',
    frontmatter: {},
    body,
    links: [],
    backlinks: [],
  });

test.each([true, false])(
  'pending Daily profile reply stays with its owner (success: %s)',
  async (success) => {
    const pending = deferred();
    const first = fakeBridge({
      'vault list': () => envelope({ vault: '/h/vault', total: 0, items: [] }),
      'vault read': readDaily('Profile A Daily'),
      daily: () => pending.promise,
    });
    const second = fakeBridge({
      'vault list': () => envelope({ vault: '/h/vault', total: 0, items: [] }),
      'vault read': readDaily('Profile B Daily'),
      daily: () => envelope({ changed: false }),
    });
    let switchProfile: (bridge: Bridge) => void = () => {};
    function Profiles() {
      const [bridge, setBridge] = useState<Bridge>(() => first.bridge);
      switchProfile = (next) => setBridge(() => next);
      return (
        <MesaRoot bridge={bridge} platform={fakePlatform()}>
          <DailyScreen onVaultItem={() => {}} />
        </MesaRoot>
      );
    }
    const byTestId = await renderWithMesa(<Profiles />, first.bridge);
    await click(byTestId('daily-rebuild')[0]);
    expect(byTestId('daily-rebuild')[0]).toHaveProperty('disabled', true);
    await act(async () => switchProfile(second.bridge));
    expect(document.body.textContent).not.toContain('Profile A Daily');
    expect(document.body.textContent).toContain('Profile B Daily');
    expect(byTestId('daily-rebuild')[0]).toHaveProperty('disabled', false);
    expect(second.calls.some((args) => args[1] === 'daily')).toBe(false);
    await click(byTestId('daily-rebuild')[0]);
    const reads = second.calls.filter((args) => args[1] === 'vault' && args[2] === 'read').length;
    await act(async () =>
      pending.resolve(
        success ? envelope({ changed: true }) : failure('Old profile rebuild failed'),
      ),
    );
    expect(second.calls.filter((args) => args[1] === 'vault' && args[2] === 'read')).toHaveLength(
      reads,
    );
    expect(second.calls.filter((args) => args[1] === 'daily')).toHaveLength(1);
    expect(byTestId('daily-rebuild')[0]).toHaveProperty('disabled', false);
    expect(toastTexts(byTestId)).toEqual([]);
  },
);

test.each([true, false])(
  'pending Daily date reply stays with its owner (success: %s)',
  async (success) => {
    const pending = deferred();
    let builds = 0;
    const { bridge, calls } = fakeBridge({
      'vault list': () => envelope({ vault: '/h/vault', total: 0, items: [] }),
      'vault read': readDaily('Invented Daily'),
      daily: () => (++builds === 1 ? pending.promise : envelope({ changed: false })),
    });
    const byTestId = await renderWithMesa(<DailyScreen onVaultItem={() => {}} />, bridge);
    const input = document.querySelector<HTMLInputElement>('#daily-date');
    if (!input) throw new Error('Daily date input is missing');
    const original = input.value;
    const next = original === '2026-09-23' ? '2026-09-22' : '2026-09-23';
    await click(byTestId('daily-rebuild')[0]);
    await act(async () => {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(byTestId('daily-rebuild')[0]).toHaveProperty('disabled', false);
    expect(calls.filter((args) => args[1] === 'daily')).toEqual([
      ['--json', 'daily', '--date', original],
    ]);
    await click(byTestId('daily-rebuild')[0]);
    const reads = calls.filter((args) => args[1] === 'vault' && args[2] === 'read').length;
    await act(async () =>
      pending.resolve(success ? envelope({ changed: true }) : failure('Old date rebuild failed')),
    );
    expect(calls.filter((args) => args[1] === 'vault' && args[2] === 'read')).toHaveLength(reads);
    expect(calls.filter((args) => args[1] === 'daily')).toEqual([
      ['--json', 'daily', '--date', original],
      ['--json', 'daily', '--date', next],
    ]);
    expect(byTestId('daily-rebuild')[0]).toHaveProperty('disabled', false);
    expect(toastTexts(byTestId)).toEqual([]);
  },
);
