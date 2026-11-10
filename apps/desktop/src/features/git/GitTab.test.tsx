// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  appearanceConfig,
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  fill,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { GitTab } from './GitTab';

const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };
const commit = {
  oid: 'b'.repeat(40),
  subject: 'Feature commit',
  author: 'Test',
  authoredAt: '2026-09-27T12:00:00Z',
  parents: ['a'.repeat(40)],
  refs: ['HEAD -> main', 'origin/main'],
};
const bridge = () =>
  fakeBridge({
    config: appearanceConfig({ diffFontSize: 17, fileTreeFontSize: 11 }),
    'git status': () =>
      envelope({
        checkout,
        branch: 'main',
        changes: [{ path: 'docs/changed.txt', index: ' ', workingTree: 'M' }],
      }),
    'git diff': () =>
      envelope({
        checkout,
        staged: false,
        path: 'docs/changed.txt',
        patch: '@@ -1 +1 @@\n-old\n+new\n',
        rows: [{ kind: 'change', left: 'old', right: 'new', oldLine: 1, newLine: 1 }],
      }),
    'git branches': () =>
      envelope({ checkout, branches: [{ name: 'main', oid: 'a', current: true }] }),
    'git graph': () => envelope({ checkout, rows: [{ graph: '* ', commit }], commits: 1 }),
    'git compare': () =>
      envelope({
        checkout,
        base: 'a'.repeat(40),
        head: commit.oid,
        behind: 0,
        ahead: 1,
        patch: 'diff --git a/src/feature.ts b/src/feature.ts\n@@ -0,0 +1 @@\n+feature\n',
        rows: [
          { kind: 'meta', left: 'diff --git a/src/feature.ts b/src/feature.ts', right: '' },
          { kind: 'meta', left: '@@ -0,0 +1 @@', right: '' },
          { kind: 'change', left: '', right: 'feature', newLine: 1 },
        ],
      }),
    'worktrees list': () => envelope([]),
  }).bridge;
const commitRow = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Commits"] button') ?? undefined;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (each) => each.textContent === label || each.getAttribute('aria-label') === label,
  );

test('the diff, both layouts, and the change list use the profile diff and tree sizes', async () => {
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  expect(byTestId('git-side-diff')[0]?.style.fontSize).toBe('17px');
  await click(button('Inline diff'));
  expect(byTestId('git-inline-diff')[0]?.style.fontSize).toBe('17px');
  const row = document.querySelector<HTMLElement>('[title="docs/changed.txt"]');
  expect(row && getComputedStyle(row).fontSize).toBe('11px');
});

test('a graph commit opens its changed files and diff at the profile diff size', async () => {
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  await click(button('Graph'));
  expect(document.querySelector('[aria-label="Git graph"] svg circle')).not.toBeNull();
  expect(document.querySelector('[aria-label="Commits"]')?.textContent).toContain('origin/main');
  await click(commitRow());
  const panel = document.querySelector('[aria-label="Git comparison"]');
  expect(panel?.textContent).toContain('feature.ts');
  expect(panel?.textContent).toContain('1 file changed');
  expect(byTestId('git-side-diff')[0]?.style.fontSize).toBe('17px');
});

test('two refs compare from the graph toolbar', async () => {
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  await click(button('Graph'));
  await click(button('Compare refs'));
  const base = document.querySelector<HTMLInputElement>('[aria-label="Compare base"]');
  const head = document.querySelector<HTMLInputElement>('[aria-label="Compare head"]');
  await act(async () => {
    for (const [field, value] of [
      [base, 'main'],
      [head, commit.oid],
    ] as const) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await click(button('Compare'));
  const panel = document.querySelector('[aria-label="Git comparison"]');
  expect(panel?.textContent).toContain('0 behind, 1 ahead');
  expect(panel?.textContent).toContain('feature');
});

/** A checkout with one staged change, and `message` as what `mesa git message` answers. */
const staged = (message: () => unknown) =>
  fakeBridge({
    config: appearanceConfig({}),
    'git status': () =>
      envelope({
        checkout,
        branch: 'main',
        changes: [{ path: 'docs/tides.md', index: 'A', workingTree: ' ' }],
      }),
    'git diff': () =>
      envelope({ checkout, staged: true, path: 'docs/tides.md', patch: '', rows: [] }),
    'git message': message,
    'git branches': () => envelope({ checkout, branches: [], remotes: [] }),
    'git commit': () => envelope({ result: { checkout, oid: 'c'.repeat(40), summary: 'x' } }),
    'worktrees list': () => envelope([]),
  });
const commitButton = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
    (each) => each.textContent?.trim() === 'Commit',
  );
const box = () => document.querySelector<HTMLTextAreaElement>('[aria-label="Commit message"]');
const generated = (message: string) =>
  envelope({ message, run: { session: 'aaaaaaaa', durationMs: 900 } });

test('Generate fills an empty message from mesa git message, spinning with Commit off while it runs', async () => {
  const answer = deferred();
  const { bridge, calls } = staged(() => answer.promise);
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  const generate = button('Generate commit message');
  expect(generate?.disabled).toBe(false);
  await click(generate);
  expect(calls).toContainEqual(['--json', 'git', 'message', '--', 'lantern-cove']);
  expect(generate?.getAttribute('aria-busy')).toBe('true');
  expect(generate?.className).toContain('animate-spin');
  await fill(box(), 'typed');
  expect(commitButton()?.disabled).toBe(true);
  await fill(box(), '');
  await act(async () => answer.resolve(generated('Add the tide table')));
  expect(box()?.value).toBe('Add the tide table');
  expect(commitButton()?.disabled).toBe(false);
});

test('Generate replaces a typed message only once confirmed, and a failed run says why', async () => {
  let reply: () => unknown = () => generated('Add the tide table');
  const { bridge } = staged(() => reply());
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  await fill(box(), 'my words');
  await click(button('Generate commit message'));
  expect(box()?.value).toBe('my words');
  await click(button('Cancel'));
  expect(box()?.value).toBe('my words');
  await click(button('Generate commit message'));
  await click(byTestId('replace-commit-message-submit')[0]);
  expect(box()?.value).toBe('Add the tide table');
  reply = () =>
    failure('the git-text run bbbbbbbb wrote no text: claude exited with status 1', 'internal');
  await click(button('Generate commit message'));
  expect(toastTexts(byTestId)).toContain(
    'the git-text run bbbbbbbb wrote no text: claude exited with status 1',
  );
  expect(box()?.value).toBe('Add the tide table');
});

test('Generate is off while nothing is staged', async () => {
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  expect(button('Generate commit message')?.disabled).toBe(true);
});

test('a commit its pre-commit hook fails offers Fix with AI, which hands it over and names the session', async () => {
  const { bridge, calls } = fakeBridge({
    config: appearanceConfig({}),
    'git status': () =>
      envelope({
        checkout,
        branch: 'main',
        changes: [{ path: 'tide.ts', index: 'A', workingTree: ' ' }],
        hooks: { preCommit: true },
      }),
    'git diff': () => envelope({ checkout, staged: true, path: 'tide.ts', patch: '', rows: [] }),
    'git commit': () => failure('cannot commit: lint: tide.ts:3 missing semicolon', 'usage'),
    'git fix': () => envelope({ passed: false, session: 'aaaaaaaa', how: 'sent' }),
    'git branches': () => envelope({ checkout, branches: [], remotes: [] }),
    'worktrees list': () => envelope([]),
  });
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  await fill(box(), 'Add the tide table');
  await click(commitButton());
  expect(toastTexts(byTestId)).toEqual(['cannot commit: lint: tide.ts:3 missing semicolon']);
  const link = byTestId('toast-link')[0];
  expect(link?.textContent).toContain('Fix with AI');
  await click(link);
  expect(calls).toContainEqual(['--json', 'git', 'fix', '--', 'lantern-cove']);
  expect(toastTexts(byTestId)).toContain("Sent the hook's failure to session aaaaaaaa");
});

test('a failed commit with no pre-commit hook offers no Fix with AI', async () => {
  const { bridge } = staged(() => envelope({}));
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, async (args, stdin) =>
    args[1] === 'git' && args[2] === 'commit'
      ? failure('cannot commit: nothing added', 'usage')
      : bridge(args, stdin),
  );
  await fill(box(), 'x');
  await click(commitButton());
  expect(toastTexts(byTestId)).toEqual(['cannot commit: nothing added']);
  expect(byTestId('toast-link')).toEqual([]);
});
