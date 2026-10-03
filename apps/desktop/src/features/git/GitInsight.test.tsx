// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { GitTab } from './GitTab';

test('the Insights control explicitly reads source, freshness, and branch-matched PR outcomes', async () => {
  const { bridge, calls } = fakeBridge({
    'git status': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/tmp/repo', registered: true },
        branch: 'main',
        changes: [],
      }),
    'git insight': () =>
      envelope({
        project: 'lantern-cove',
        local: {
          source: 'git',
          observedAt: '2026-09-27T00:00:00Z',
          checkout: '/tmp/repo',
          branch: 'main',
          head: 'abcdef123456',
          changedFiles: 0,
          worktrees: 2,
          recent: [],
        },
        pullRequests: {
          source: 'gh',
          observedAt: '2026-09-27T00:00:01Z',
          version: 'gh version 2.test',
          availability: 'available',
          searched: true,
          limited: false,
          matches: [
            {
              number: 42,
              title: 'Feature',
              url: 'https://github.com/example/repo/pull/42',
              state: 'MERGED',
              isDraft: false,
              branch: 'feature',
              updatedAt: '2026-09-27T00:00:00Z',
              mergedAt: '2026-09-27T00:00:00Z',
              closedAt: '2026-09-27T00:00:00Z',
              sessionIds: ['aaaaaaaa'],
              linkedBy: 'branch-name',
            },
          ],
        },
      }),
  });
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  expect(calls.some((args) => args[1] === 'git' && args[2] === 'insight')).toBe(false);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Graph',
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.getAttribute('aria-label') === 'Insights',
    ),
  );
  expect(calls.some((args) => args[1] === 'git' && args[2] === 'insight')).toBe(true);
  const text = document.querySelector('[aria-label="Repository insight"]')?.textContent ?? '';
  expect(text).toContain('Local Git, observed 2026-09-27T00:00:00Z');
  expect(text).toContain('GitHub CLI gh version 2.test');
  expect(text).toContain('MERGED');
  expect(text).toContain('sessions aaaaaaaa');
  expect(document.querySelector('[aria-label="Repository insight"] a')?.getAttribute('href')).toBe(
    'https://github.com/example/repo/pull/42',
  );
});

test('a manual worktree without a session is selectable for Git', async () => {
  const { bridge } = fakeBridge({
    'worktrees list': () =>
      envelope([
        { path: '/tmp/repo', main: true, state: 'ready', holders: [] },
        { path: '/tmp/manual', main: false, state: 'ready', holders: [] },
      ]),
    'git status': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/tmp/repo', registered: true },
        branch: 'main',
        changes: [],
      }),
  });
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  expect(document.querySelector('select[aria-label="Checkout"]')?.textContent).toContain(
    '/tmp/manual',
  );
});
