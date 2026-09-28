// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from '@/App';
import { CONFIRMATION_MS } from '@/components/Toast';
import {
  choose,
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  fakeTerminals,
  foreignRow,
  managedRow,
  PROJECTS,
  renderWithMesa,
  report,
  toasts,
  toastTexts,
} from '@/lib/testing';

test('sidebar opens a project workspace and its Skills tab', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('/src/lantern-cove');
  expect(byTestId('project-active-session')[0]?.getAttribute('aria-label')).toContain('aaaaaaaa');
  await click(
    [...(byTestId('project-workspace')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.toLowerCase() === 'skills',
    ),
  );
  expect(byTestId('project-workspace')[0]?.textContent).toContain('No skills found.');
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('projects-screen')).toHaveLength(1);
});

test('project native history imports a Codex conversation through the existing session action', async () => {
  const nativeId = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([]),
    history: () =>
      envelope({
        rows: [
          {
            agent: 'codex',
            id: nativeId,
            cwd: '/src/lantern-cove',
            updatedAt: '2026-09-20T12:00:00.000Z',
          },
        ],
        total: 1,
        unsupported: [{ agent: 'antigravity', reason: 'No qualified native CLI history source' }],
      }),
    'history search': () =>
      envelope({
        hits: [
          {
            agent: 'codex',
            id: nativeId,
            cwd: '/src/lantern-cove',
            role: 'user',
            excerpt: 'Find harbor charts',
          },
        ],
        filesSearched: 1,
        truncated: false,
        unsupported: [{ agent: 'antigravity', reason: 'No qualified native CLI history source' }],
      }),
    adopt: () => envelope({ ...managedRow('eeeeeeee'), id: 'eeeeeeee' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...(byTestId('project-workspace')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Native history',
    ),
  );
  expect(byTestId('native-history')[0]?.textContent).toContain(nativeId);
  await act(async () => {
    const query = byTestId('native-history-query')[0] as HTMLInputElement;
    query.value = 'harbor';
    query.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    [...(byTestId('native-history')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Search',
    ),
  );
  expect(calls).toContainEqual(['--json', 'history', 'search', '--', 'lantern-cove', 'harbor']);
  expect(byTestId('native-history-results')[0]?.textContent).toContain('Find harbor charts');
  await click(
    [...(byTestId('native-history')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Import',
    ),
  );
  expect(byTestId('native-import-dialog')[0]?.textContent).toContain('End the session');
  await click(byTestId('native-import-submit')[0]);
  expect(calls).toContainEqual(['--json', 'adopt', '--project', 'lantern-cove', '--', nativeId]);
});

test('project and session show scoped decisions and note changes with exact Obsidian targets', async () => {
  const decision = {
    path: 'receipts/decision.md',
    summary: 'Chose the release plan',
    receipt: {
      id: '01TEST00000000000000000001',
      kind: 'decision',
      status: 'ok',
      started: '2026-09-24T12:00',
      inputs: { rationale: 'The migration must stay reversible' },
      outputs: {},
      decisions: [{ question: 'ship', answer: 'yes' }],
    },
  };
  const change = {
    path: 'receipts/change.md',
    summary: 'Updated project brief',
    receipt: {
      id: '01TEST00000000000000000002',
      kind: 'vault-change',
      status: 'ok',
      started: '2026-09-24T12:01',
      inputs: {},
      outputs: { target: 'projects/lantern-cove.md' },
      decisions: [],
    },
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    receipts: (args) =>
      envelope(
        args.includes('--session')
          ? args.includes('decision')
            ? [decision]
            : []
          : args.includes('decision')
            ? [decision]
            : args.includes('vault-change')
              ? [change]
              : [],
      ),
    'vault open': () => envelope({ opened: true, method: 'uri', target: 'obsidian://open' }),
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({ terminal: fakeTerminals().host }),
  );
  await click(byTestId('sidebar-project')[0]);
  expect(byTestId('knowledge-context')[0]?.textContent).toContain(
    'The migration must stay reversible',
  );
  expect(byTestId('knowledge-context')[0]?.textContent).toContain('projects/lantern-cove.md');
  await click(
    byTestId('knowledge-context')[0]?.querySelector<HTMLButtonElement>(
      '[aria-label="Open projects/lantern-cove.md in Obsidian"]',
    ) ?? undefined,
  );
  expect(calls).toContainEqual(['--json', 'vault', 'open', '--', 'projects/lantern-cove.md']);
  await click(byTestId('project-active-session')[0]);
  await click(document.querySelector('[aria-label="Session actions"]') as HTMLElement);
  expect(byTestId('knowledge-context')[0]?.textContent).toContain('Chose the release plan');
  expect(byTestId('knowledge-context')[0]?.textContent).not.toContain('Updated project brief');
});

test('project Git tab reads selected checkout status through the CLI bridge', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'git status': (args) =>
      envelope({
        checkout: {
          project: 'lantern-cove',
          path: args.includes('--checkout') ? '/h/feature' : '/h/src/lantern-cove',
          registered: !args.includes('--checkout'),
        },
        branch: 'main',
        changes: [{ path: 'changed.txt', index: ' ', workingTree: 'M' }],
      }),
    'git diff': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true },
        staged: false,
        path: 'changed.txt',
        patch: '@@ -1 +1 @@\n-old\n+new\n',
        rows: [
          { kind: 'meta', left: '@@ -1 +1 @@', right: '@@ -1 +1 @@' },
          { kind: 'change', left: 'old', right: 'new' },
        ],
      }),
    'worktrees list': () =>
      envelope([
        { path: '/h/src/lantern-cove', main: true, state: 'ready', holders: [] },
        { path: '/h/feature', main: false, state: 'ready', holders: [] },
      ]),
    sessions: () =>
      envelope([managedRow('aaaaaaaa', { worktree: { path: '/h/feature', branch: 'feature' } })]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'git'),
  );
  expect(document.querySelector('[aria-label="Changed files"]')?.textContent).toContain(
    'changed.txt',
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Changed files"] button')][0],
  );
  expect(byTestId('git-inline-diff')[0]?.textContent).toContain('+new');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git diff"] button')].find(
      (button) => button.textContent === 'Side by side',
    ),
  );
  expect(byTestId('git-side-diff')[0]?.textContent).toContain('oldnew');
  expect(calls.some((args) => args.includes('status') && args.includes('lantern-cove'))).toBe(true);
  const checkout = document.querySelector<HTMLSelectElement>('[aria-label="Checkout"]');
  expect(checkout?.options).toHaveLength(2);
  await act(async () => {
    if (checkout) {
      checkout.value = '/h/feature';
      checkout.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  expect(calls.some((args) => args.includes('--checkout') && args.includes('/h/feature'))).toBe(
    true,
  );
});

test('project Files tab edits through the bridge, previews inert Markdown, and protects dirty navigation', async () => {
  let text = '# Guide\nsecond line\n';
  let revision = 'a'.repeat(64);
  const checkout = { project: 'lantern-cove', path: '/src/lantern-cove', registered: true };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'files tree': () =>
      envelope({
        checkout,
        entries: [
          { path: 'docs', kind: 'directory', depth: 0 },
          { path: 'docs/guide.md', kind: 'file', depth: 1 },
        ],
        truncated: false,
      }),
    'files read': () =>
      envelope({
        checkout,
        path: 'docs/guide.md',
        text,
        revision,
        lines: text.split('\n').length,
        targetLine: 2,
      }),
    'files write': (args) => {
      text = (args.find((arg) => arg.startsWith('--text=')) ?? '').slice(7);
      revision = 'b'.repeat(64);
      return envelope({
        checkout,
        path: 'docs/guide.md',
        revision,
        action: 'write',
        receipt: null,
      });
    },
    'files search': () =>
      envelope({
        checkout,
        query: 'second',
        mode: 'content',
        hits: [{ path: 'docs/guide.md', line: 2, preview: 'second line' }],
        truncated: false,
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'files',
    ),
  );
  expect(byTestId('files-workspace')).toHaveLength(1);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="File tree"] button')].find(
      (button) => button.textContent === 'guide.md',
    ),
  );
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).value).toBe(text);
  await act(async () => {
    const editor = byTestId('file-editor-text')[0] as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      editor,
      '# Edited\n<script>alert(1)</script>\n![remote](https://example.com/track.png)',
    );
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'git',
    ),
  );
  expect(byTestId('file-leave-dialog')).toHaveLength(1);
  await click(
    [
      ...document.querySelectorAll<HTMLButtonElement>('[data-testid="file-leave-dialog"] button'),
    ].find((button) => button.textContent === 'Cancel'),
  );
  expect(byTestId('files-workspace')).toHaveLength(1);
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('file-navigation-dialog')).toHaveLength(1);
  await click(
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="file-navigation-dialog"] button',
      ),
    ].find((button) => button.textContent === 'Cancel'),
  );
  expect(byTestId('files-workspace')).toHaveLength(1);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Preview',
    ),
  );
  expect(byTestId('markdown-preview')[0]?.querySelector('h1')?.textContent).toBe('Edited');
  expect(byTestId('markdown-preview')[0]?.querySelector('script,img')).toBeNull();
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Save',
    ),
  );
  expect(
    calls.some(
      (args) => args[1] === 'files' && args[2] === 'write' && args.includes('a'.repeat(64)),
    ),
  ).toBe(true);
  expect(text).toContain('# Edited');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Close',
    ),
  );
  expect(byTestId('file-editor-text')).toHaveLength(0);
});

test('project Files tab searches, jumps to an exact line, and exposes checked file mutations', async () => {
  const checkout = { project: 'lantern-cove', path: '/src/lantern-cove', registered: true };
  const files = new Map([['docs/guide.md', 'first\nsecond line\n']]);
  const revision = 'a'.repeat(64);
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'files tree': () =>
      envelope({
        checkout,
        entries: [
          { path: 'docs', kind: 'directory', depth: 0 },
          ...[...files.keys()].map((path) => ({ path, kind: 'file', depth: 1 })),
        ],
        truncated: false,
      }),
    'files read': (args) => {
      const path = args.at(-1) ?? '';
      const text = files.get(path) ?? '';
      const lineFlag = args.indexOf('--line');
      return envelope({
        checkout,
        path,
        text,
        revision,
        lines: text.split('\n').length,
        ...(lineFlag > 0 ? { targetLine: Number(args[lineFlag + 1]) } : {}),
      });
    },
    'files search': () =>
      envelope({
        checkout,
        query: 'second',
        mode: 'content',
        hits: [{ path: 'docs/guide.md', line: 2, preview: 'second line' }],
        truncated: false,
      }),
    'files create': (args) => {
      const path = args.at(-1) ?? '';
      files.set(path, '');
      return envelope({ checkout, path, revision, action: 'create', receipt: null });
    },
    'files rename': (args) => {
      const from = args.at(-2) ?? '';
      const path = args.at(-1) ?? '';
      files.set(path, files.get(from) ?? '');
      files.delete(from);
      return envelope({ checkout, from, path, revision, action: 'rename', receipt: null });
    },
    'files delete': (args) => {
      const path = args.at(-1) ?? '';
      files.delete(path);
      return envelope({ checkout, path, action: 'delete', receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'files',
    ),
  );
  const treeRows = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="File tree"] button[data-file-row]',
    ),
  ];
  treeRows[0]?.focus();
  await act(async () =>
    treeRows[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(document.activeElement).toBe(treeRows[1]);
  await choose(document.querySelector('[aria-label="File search mode"]') ?? undefined, 'content');
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Search files"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      'second',
    );
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    document.querySelector<HTMLButtonElement>('[aria-label="Run file search"]') ?? undefined,
  );
  await click(
    document.querySelector<HTMLButtonElement>(
      '[aria-label="File search results"] button:nth-child(2)',
    ) ?? undefined,
  );
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).selectionStart).toBe(6);
  const goTo = document.querySelector<HTMLInputElement>('[aria-label="Go to file and line"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      goTo,
      'docs/guide.md:2',
    );
    goTo?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Go to file',
    ),
  );
  expect(
    calls.some(
      (args) =>
        args[1] === 'files' && args[2] === 'read' && args.includes('--line') && args.includes('2'),
    ),
  ).toBe(true);
  await click(document.querySelector<HTMLButtonElement>('[aria-label="Create file"]') ?? undefined);
  (document.querySelector('#new-file-path') as HTMLInputElement).value = 'docs/new.md';
  await click(byTestId('confirm-file-create')[0]);
  expect(files.has('docs/new.md')).toBe(true);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Rename',
    ),
  );
  (document.querySelector('#rename-file-path') as HTMLInputElement).value = 'docs/renamed.md';
  await click(byTestId('confirm-file-rename')[0]);
  expect(files.has('docs/renamed.md')).toBe(true);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Delete',
    ),
  );
  await click(
    [
      ...document.querySelectorAll<HTMLButtonElement>('[data-testid="file-delete-dialog"] button'),
    ].find((button) => button.textContent === 'Cancel'),
  );
  expect(files.has('docs/renamed.md')).toBe(true);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Delete',
    ),
  );
  await click(byTestId('confirm-file-delete')[0]);
  expect(files.has('docs/renamed.md')).toBe(false);
});

test('project Git actions stage, unstage and commit through the CLI bridge', async () => {
  let staged = false;
  let committed = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'git status': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true },
        branch: 'main',
        changes: committed
          ? []
          : [{ path: 'note.txt', index: staged ? 'A' : '?', workingTree: staged ? ' ' : '?' }],
      }),
    'git stage': () => {
      staged = true;
      return envelope({ path: 'note.txt', action: 'stage', receipt: null });
    },
    'git unstage': () => {
      staged = false;
      return envelope({ path: 'note.txt', action: 'unstage', receipt: null });
    },
    'git commit': () => {
      committed = true;
      return envelope({ oid: 'abcdef0123456789', summary: 'Add note', receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'git'),
  );
  const action = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === label,
    );
  await click(action('Stage'));
  expect(action('Unstage')).toBeDefined();
  await click(action('Unstage'));
  expect(action('Stage')).toBeDefined();
  await click(action('Stage'));
  const message = document.querySelector<HTMLInputElement>('[aria-label="Commit message"]');
  await act(async () => {
    if (message) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        message,
        'Add note',
      );
      message.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(action('Commit staged')?.disabled).toBe(false);
  await click(action('Commit staged'));
  expect(document.querySelector('[aria-label="Git status"]')?.textContent).toContain(
    'Working tree clean.',
  );
  expect(calls.some((args) => args.includes('commit') && args.includes('--message=Add note'))).toBe(
    true,
  );
});

test('project Git branch panel creates and confirms deletion through the CLI bridge', async () => {
  let created = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'git status': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true },
        branch: 'main',
        changes: [],
      }),
    'git branches': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true },
        branches: [
          { name: 'main', oid: 'abc', current: true, checkedOutAt: '/h/src/lantern-cove' },
          ...(created ? [{ name: 'next', oid: 'abc', current: false }] : []),
        ],
      }),
    'git branch create': () => {
      created = true;
      return envelope({ name: 'next', action: 'create', receipt: null });
    },
    'git branch delete': () => {
      created = false;
      return envelope({ name: 'next', action: 'delete', receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'git'),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Branches',
    ),
  );
  const name = document.querySelector<HTMLInputElement>('[aria-label="New branch name"]');
  await act(async () => {
    if (name) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'next');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Local branches"] button')].find(
      (button) => button.textContent === 'Create branch',
    ),
  );
  expect(calls.some((args) => args.includes('create') && args.includes('next'))).toBe(true);
  expect(document.querySelector('[aria-label="Local branches"]')?.textContent).toContain('next');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Local branches"] button')].find(
      (button) => button.textContent === 'Delete',
    ),
  );
  expect(byTestId('git-delete-branch-dialog')).toHaveLength(1);
  await click(byTestId('confirm-git-delete-branch')[0]);
  expect(calls.some((args) => args.includes('delete') && args.includes('next'))).toBe(true);
});

test('project Git stash panel saves changes and confirms a drop through the CLI bridge', async () => {
  let saved = false;
  const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'git status': () => envelope({ checkout, branch: 'main', changes: [] }),
    'git stashes': () =>
      envelope({
        checkout,
        stashes: saved ? [{ ref: 'stash@{0}', oid: 'abc', message: 'On main: saved' }] : [],
      }),
    'git stash create': () => {
      saved = true;
      return envelope({ checkout, created: true, oid: 'abc', receipt: null });
    },
    'git stash drop': () => {
      saved = false;
      return envelope({ checkout, action: 'drop', ref: 'stash@{0}', oid: 'abc', receipt: null });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'git'),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Stashes',
    ),
  );
  expect(document.querySelector('[aria-label="Git stashes"]')?.textContent).toContain(
    'No saved stashes.',
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git stashes"] button')].find(
      (button) => button.textContent === 'Stash changes',
    ),
  );
  expect(document.querySelector('[aria-label="Git stashes"]')?.textContent).toContain('stash@{0}');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git stashes"] button')].find(
      (button) => button.textContent === 'Drop',
    ),
  );
  expect(byTestId('git-drop-stash-dialog')).toHaveLength(1);
  await click(byTestId('confirm-git-drop-stash')[0]);
  expect(calls.some((args) => args.includes('drop') && args.includes('stash@{0}'))).toBe(true);
  expect(document.querySelector('[aria-label="Git stashes"]')?.textContent).toContain(
    'No saved stashes.',
  );
});

test('project Git remote panel shows its upstream and confirms an explicit push', async () => {
  const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'git status': () => envelope({ checkout, branch: 'main', changes: [] }),
    'git branches': () =>
      envelope({ checkout, branches: [{ name: 'main', oid: 'abc', current: true }] }),
    'git stashes': () => envelope({ checkout, stashes: [] }),
    'git graph': () => envelope({ checkout, rows: [], commits: 0 }),
    'git tracking': () =>
      envelope({ checkout, branch: 'main', remote: 'origin', upstream: 'main' }),
    'git push': () =>
      envelope({
        checkout,
        branch: 'main',
        remote: 'origin',
        upstream: 'main',
        action: 'push',
        before: 'abc',
        after: 'abc',
        output: '',
        receipt: null,
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'git'),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Branches',
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Stashes',
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Remote',
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Graph',
    ),
  );
  expect(document.querySelector('[aria-label="Git sync"]')?.textContent).toContain(
    'main tracks origin/main',
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git sync"] button')].find(
      (button) => button.textContent === 'Push',
    ),
  );
  expect(byTestId('git-sync-dialog')[0]?.textContent).toContain('without force');
  await click(byTestId('confirm-git-sync')[0]);
  expect(calls.some((args) => args.includes('push') && args.includes('--yes'))).toBe(true);
  expect(document.querySelectorAll('[aria-label="Git sync"]')).toHaveLength(1);
  expect(document.querySelectorAll('[aria-label="Git graph"]')).toHaveLength(1);
  expect(document.querySelectorAll('[aria-label="Local branches"]')).toHaveLength(1);
  expect(document.querySelectorAll('[aria-label="Git stashes"]')).toHaveLength(1);
});

test('project Git graph filters a branch and compares a selected commit', async () => {
  const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };
  const feature = {
    oid: 'f'.repeat(40),
    parents: ['a'.repeat(40)],
    subject: 'Feature commit',
    author: 'Test',
    authoredAt: '2026-09-27T12:00:00Z',
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'git status': () => envelope({ checkout, branch: 'main', changes: [] }),
    'git branches': () =>
      envelope({
        checkout,
        branches: [
          { name: 'main', oid: 'a', current: true },
          { name: 'feature', oid: feature.oid, current: false },
        ],
      }),
    'git graph': (args) =>
      envelope({
        checkout,
        branch: args.includes('--branch') ? 'feature' : undefined,
        rows: args.includes('--branch')
          ? [{ graph: '* ', commit: feature }]
          : [
              { graph: '* ', commit: feature },
              { graph: '* ', commit: { ...feature, oid: 'a'.repeat(40), subject: 'Main commit' } },
            ],
        commits: args.includes('--branch') ? 1 : 2,
      }),
    'git compare': () =>
      envelope({
        checkout,
        base: 'a'.repeat(40),
        head: feature.oid,
        behind: 1,
        ahead: 1,
        patch: '+feature\n',
        rows: [{ kind: 'change', left: '', right: 'feature' }],
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll('button')].find((button) => button.textContent === 'git'),
  );
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git status"] button')].find(
      (button) => button.textContent === 'Graph',
    ),
  );
  expect(document.querySelector('[aria-label="Commits"]')?.textContent).toContain('Main commit');
  await choose(document.querySelector('[aria-label="Graph branch"]') ?? undefined, 'feature');
  expect(document.querySelector('[aria-label="Commits"]')?.textContent).not.toContain(
    'Main commit',
  );
  await click(
    document.querySelector<HTMLButtonElement>('[aria-label="Commits"] button') ?? undefined,
  );
  const base = document.querySelector<HTMLInputElement>('[aria-label="Compare base"]');
  await act(async () => {
    if (base) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(base, 'main');
      base.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Git graph"] button')].find(
      (button) => button.textContent === 'Compare',
    ),
  );
  expect(document.querySelector('[aria-label="Git comparison"]')?.textContent).toContain(
    '1 behind, 1 ahead',
  );
  expect(
    calls.some(
      (args) => args.includes('compare') && args.includes('main') && args.includes(feature.oid),
    ),
  ).toBe(true);
});

test('Sessions and Projects tabs keep the same live session and expand the goal composer in place', async () => {
  const terms = fakeTerminals();
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([
        managedRow('aaaaaaaa', {
          lastState: {
            state: 'waiting-permission',
            confidence: 0.9,
            at: '2026-09-25T12:00:00.000Z',
            source: 'hook',
          },
        }),
        managedRow('finished', {
          lastState: {
            state: 'failed',
            confidence: 0.9,
            at: '2026-09-25T12:00:00.000Z',
            source: 'hook',
          },
        }),
        managedRow('queuedone', {
          alive: false,
          lastState: {
            state: 'queued',
            confidence: 1,
            at: '2026-09-25T12:00:00.000Z',
            source: 'mesa',
          },
        }),
      ]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge, fakePlatform({ terminal: terms.host }));
  const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  expect(
    tabs()
      .find((tab) => tab.textContent?.includes('Sessions'))
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  await click(tabs().find((tab) => tab.textContent?.includes('Projects')));
  expect(byTestId('project-workspace')).toHaveLength(1);
  expect(byTestId('project-active-session')).toHaveLength(2);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('finished');
  expect(byTestId('project-active-session')[1]?.getAttribute('aria-label')).toContain('queuedone');
  expect(
    byTestId('project-active-session')[0]?.querySelector('[data-state="waiting-permission"]'),
  ).not.toBeNull();
  expect(document.querySelector('#session-location')).toBeNull();
  await act(async () => (byTestId('project-goal')[0] as HTMLTextAreaElement).focus());
  expect(document.querySelector('#session-location')).not.toBeNull();
  await click(byTestId('project-active-session')[0]);
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  expect(
    tabs()
      .find((tab) => tab.textContent?.includes('Sessions'))
      ?.getAttribute('aria-selected'),
  ).toBe('true');
  await click(tabs().find((tab) => tab.textContent?.includes('Projects')));
  await click(byTestId('sidebar-project')[1]);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('tide');
  await click(tabs().find((tab) => tab.textContent?.includes('Sessions')));
  await click(tabs().find((tab) => tab.textContent?.includes('Projects')));
  expect(byTestId('project-workspace')[0]?.textContent).toContain('tide');
});

test('sidebar selects an exact session and keeps its terminal alive across navigation', async () => {
  const terms = fakeTerminals();
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([managedRow('aaaaaaaa'), foreignRow, managedRow('bbbbbbbb', { project: 'other' })]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge, fakePlatform({ terminal: terms.host }));
  expect(byTestId('sidebar-session').map((item) => item.textContent)).toEqual([
    'Sessionworking',
    'Sessionworking',
  ]);
  await click(byTestId('sidebar-session')[1]);
  expect(byTestId('selected-session')[0]?.textContent).toContain('Session');
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(terms.calls.filter((call) => call[0] === 'open').map((call) => call[1])).toEqual([
    'aaaaaaaa',
    'bbbbbbbb',
  ]);
  await click(byTestId('nav-doctor')[0]);
  await click(byTestId('nav-board')[0]);
  await click(byTestId('sidebar-session')[1]);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(terms.calls.filter((call) => call[0] === 'close')).toEqual([]);
  expect(terms.calls.filter((call) => call[0] === 'open')).toHaveLength(2);
  await click(document.querySelector('[aria-label="Collapse sidebar"]') as HTMLElement);
  expect(byTestId('workspace-sidebar')[0]?.dataset.collapsed).toBe('true');
  expect(byTestId('selected-session')).toHaveLength(1);
  await click(byTestId('search-trigger')[0]);
  const grid = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    grid.value = 'Open Grid View';
    grid.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(byTestId('grid-toolbar')).toHaveLength(1);
});

test('Sessions sidebar shows a branch and lets each card compact without losing selection', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([
        managedRow('aaaaaaaa', { worktree: { path: '/h/worktrees/feature', branch: 'feature' } }),
      ]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const card = () => byTestId('sidebar-session')[0];
  expect(card()?.textContent).toContain('feature');
  expect(card()?.textContent).toContain('working');
  await click(document.querySelector('[aria-label="Compact Session card"]') as HTMLElement);
  expect(card()?.textContent).toBe('Session');
  expect(byTestId('selected-session')).toHaveLength(1);
  await click(document.querySelector('[aria-label="Expand Session card"]') as HTMLElement);
  expect(card()?.textContent).toContain('feature');
  expect(card()?.textContent).toContain('working');
});

test('selected session details read native context by exact id and keep unknown facts honest', async () => {
  const row = managedRow('aaaaaaaa');
  let reading = true;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row]),
    show: () =>
      envelope(
        reading
          ? {
              ...row,
              context: {
                used: 10.04,
                window: 258400,
                at: '2026-09-27T12:01:00.000Z',
                source: 'transcript',
                model: 'claude-opus-5-5',
                effort: 'xhigh',
              },
            }
          : row,
      ),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  const details = byTestId('selected-session-details')[0];
  expect(calls).toContainEqual(['--json', 'show', '--', 'aaaaaaaa']);
  expect(details?.textContent).toContain('/src/lantern-cove');
  expect(details?.textContent).toContain('Modelclaude-opus-5-5');
  expect(details?.textContent).toContain('Effortxhigh');
  expect(details?.textContent).toContain('10.04% of 258,400 tokens');
  expect(details?.textContent).toContain('transcript');
  expect(
    document.querySelector('[aria-label="Context window: 10.04%"]')?.getAttribute('role'),
  ).toBe('progressbar');
  reading = false;
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(details?.textContent).toContain('ContextUnknown');
  expect(details?.textContent).toContain('ModelUnknown');
  expect(details?.textContent).toContain('EffortUnknown');
  expect(
    document.querySelector('[aria-label="Context window: unknown"]')?.getAttribute('role'),
  ).toBe('img');
});

test('session close opens archive confirmation and archives only after confirmation', async () => {
  let archived = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope(
        archived ? [managedRow('bbbbbbbb')] : [managedRow('aaaaaaaa'), managedRow('bbbbbbbb')],
      ),
    archive: () => {
      archived = true;
      return envelope({ ...managedRow('aaaaaaaa'), archivedAt: '2026-09-27T12:00:00.000Z' });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const close = () =>
    document.querySelector('[aria-label="Archive Session (aaaaaaaa)"]') as HTMLElement;
  await click(close());
  expect(byTestId('archive-dialog')[0]?.textContent).toContain('Archive this session?');
  expect(calls.some((args) => args.includes('archive'))).toBe(false);
  await click(
    [...(byTestId('archive-dialog')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Cancel',
    ),
  );
  expect(byTestId('archive-dialog')).toHaveLength(0);
  await click(close());
  await click(byTestId('archive-confirm')[0]);
  expect(calls).toContainEqual(['--json', 'archive', '--', 'aaaaaaaa']);
  expect(byTestId('archive-dialog')).toHaveLength(0);
  expect(byTestId('sidebar-session')).toHaveLength(1);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
});

test('Sessions offers restore or dismiss for saved runs whose terminal ended', async () => {
  const ended = (id: string, extra: Partial<ReturnType<typeof managedRow>> = {}) =>
    managedRow(id, {
      ...extra,
      alive: false,
      lastState: {
        state: 'done',
        confidence: 1,
        at: '2026-09-27T12:00:00.000Z',
        source: 'tmux',
      },
    });
  let restored = false;
  let dismissed = false;
  const next = managedRow('cccccccc', { resumedFrom: 'aaaaaaaa' });
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([
        ...(restored ? [next] : [ended('aaaaaaaa')]),
        ...(dismissed
          ? []
          : [
              ended('bbbbbbbb', { kind: 'terminal', agent: 'terminal', agentSessionId: undefined }),
            ]),
        ended('dddddddd', { background: true, backgroundId: 'native-background' }),
      ]),
    resume: () => {
      restored = true;
      return envelope(next);
    },
    archive: () => {
      dismissed = true;
      return envelope({ ...ended('bbbbbbbb'), archivedAt: '2026-09-27T12:01:00.000Z' });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('recoverable-sessions')[0]?.textContent).toContain('Session');
  expect(
    byTestId('recoverable-sessions')[0]?.querySelectorAll('[data-testid="sidebar-session"]'),
  ).toHaveLength(2);
  expect(byTestId('session-recovery')[0]?.textContent).toContain('Restore');
  await click(
    [...(byTestId('session-recovery')[0]?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Restore'),
    ),
  );
  expect(calls).toContainEqual(['--json', 'resume', '--', 'aaaaaaaa']);
  expect(byTestId('terminal-cccccccc')).toHaveLength(1);
  await click(
    byTestId('recoverable-sessions')[0]?.querySelector<HTMLElement>(
      '[data-testid="sidebar-session"]',
    ) ?? undefined,
  );
  expect(byTestId('session-recovery')[0]?.textContent).not.toContain('Restore');
  await click(
    [...(byTestId('session-recovery')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Dismiss',
    ),
  );
  expect(byTestId('archive-dialog')[0]?.textContent).toContain('Its record and logs stay');
  expect(calls).not.toContainEqual(['--json', 'archive', '--', 'bbbbbbbb']);
  await click(byTestId('archive-confirm')[0]);
  expect(calls).toContainEqual(['--json', 'archive', '--', 'bbbbbbbb']);
  expect(byTestId('recoverable-sessions')).toHaveLength(0);
});

test('project Overview starts worktree goals and quick empty sessions through mesa open', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope(managedRow('newnewnew')),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  const form = byTestId('project-session-form')[0] as HTMLFormElement;
  await act(async () => (byTestId('project-goal')[0] as HTMLTextAreaElement).focus());
  const agent = [...form.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  await click(agent[1]);
  (byTestId('project-goal')[0] as HTMLTextAreaElement).value = 'Review the API\nThen test it';
  await choose(form.querySelector('#session-location') as HTMLElement, 'worktree');
  (byTestId('project-branch')[0] as HTMLInputElement).value = 'feature/api';
  await act(async () => form.requestSubmit());
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'codex',
    '--goal=Review the API\nThen test it',
    '--branch=feature/api',
    '--',
    'lantern-cove',
  ]);
  await click(byTestId('sidebar-project')[0]);
  await click(byTestId('quick-main')[0]);
  expect(calls).toContainEqual(['--json', 'open', '--no-parent', '--', 'lantern-cove']);
});

test('project composer passes Plan only for a provider with a native startup mode', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope(managedRow('newnewnew')),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  const form = byTestId('project-session-form')[0] as HTMLFormElement;
  await act(async () => (byTestId('project-goal')[0] as HTMLTextAreaElement).focus());
  await choose(byTestId('session-mode')[0], 'plan');
  await click(byTestId('session-background')[0]);
  await act(async () => form.requestSubmit());
  expect(calls.filter((args) => args.includes('open')).at(-1)).toEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'claude',
    '--mode',
    'plan',
    '--background',
    '--',
    'lantern-cove',
  ]);
  const agents = [...form.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  await click(agents[1]);
  expect(byTestId('session-mode')).toHaveLength(0);
});

test('quick terminal tile opens a plain terminal in the selected project', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope(managedRow('term0001', { kind: 'terminal', agent: 'terminal' })),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(byTestId('quick-terminal')[0]);
  expect(byTestId('new-session-dialog')[0]?.textContent).toContain('New terminal session');
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--terminal',
    '--',
    'lantern-cove',
  ]);
});

test('a plain terminal opens in Sessions without coding-agent send or handoff controls', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('term0001', { kind: 'terminal', agent: 'terminal' })]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('terminal-term0001')).toHaveLength(1);
  await click(document.querySelector('[aria-label="Session actions"]') as HTMLElement);
  expect(document.querySelector('[aria-label="Prompt for term0001"]')).toBeNull();
  await click(byTestId('nav-board')[0]);
  expect(byTestId('session-send')).toHaveLength(0);
  expect(byTestId('session-handoff')).toHaveLength(0);
});

test('project session menu offers three real launch paths and closes after choosing one', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope(managedRow('term0001', { kind: 'terminal', agent: 'terminal' })),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const menu = document.querySelector('[aria-label="New session in lantern-cove"]') as HTMLElement;
  await click(menu);
  const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  expect(options.map((button) => button.textContent)).toEqual([
    'New session',
    'New terminal session',
    'New worktree session',
  ]);
  await click(options[1]);
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--terminal',
    '--',
    'lantern-cove',
  ]);
  expect(byTestId('selected-session')).toHaveLength(1);
});

test('global New session offers General without a registered project', async () => {
  const generalRow = managedRow('gener001', { project: '__mesa_general__', cwd: '/h' });
  const { bridge, calls } = fakeBridge({
    projects: () => envelope([]),
    config: () => envelope({ defaultAgent: 'codex', shortcuts: DEFAULT_SHORTCUTS }),
    sessions: () => envelope([generalRow]),
    open: () => envelope(generalRow),
    archive: () => envelope({ ...generalRow, archivedAt: '2026-09-27T12:00:00.000Z' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const menu = document.querySelector('[aria-label="New session"]') as HTMLElement;
  await click(menu);
  const general = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((button) =>
    button.textContent?.includes('General Session'),
  );
  await click(general);
  expect(byTestId('new-session-dialog')[0]?.textContent).toContain('General session');
  expect(byTestId('new-session-project')).toHaveLength(0);
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--no-parent',
    '--agent',
    'codex',
    '--general',
    '--',
  ]);
  await click(
    [...(byTestId('selected-session')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'General',
    ),
  );
  expect(byTestId('selected-session')).toHaveLength(0);
  expect(byTestId('project-workspace')).toHaveLength(0);
  await click(byTestId('sidebar-session')[0]);
  await click(document.querySelector('[aria-label="Archive Session (gener001)"]') as HTMLElement);
  await click(byTestId('archive-confirm')[0]);
  expect(byTestId('selected-session')).toHaveLength(0);
  expect(byTestId('project-workspace')).toHaveLength(0);
});

test('selected session actions launch a child terminal and a child worktree', async () => {
  const parent = managedRow('parent01', {
    worktree: { path: '/h/worktrees/feature', branch: 'feature' },
  });
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([parent]),
    open: () => envelope(managedRow('child001', { kind: 'terminal', agent: 'terminal' })),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const actions = () => document.querySelector('[aria-label="Session actions"]') as HTMLElement;
  await click(actions());
  await click(
    [...(actions().parentElement?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('New terminal session'),
    ),
  );
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--parent',
    parent.id,
    '--terminal',
    '--',
    'lantern-cove',
  ]);

  await click(byTestId('sidebar-session')[0]);
  await click(actions());
  await click(
    [...(actions().parentElement?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('New child worktree session'),
    ),
  );
  expect((byTestId('new-session-project')[0] as HTMLInputElement).value).toBe('lantern-cove');
  (byTestId('new-session-branch')[0] as HTMLInputElement).value = 'child-branch';
  await click(byTestId('new-session-submit')[0]);
  expect(calls).toContainEqual([
    '--json',
    'open',
    '--parent',
    parent.id,
    '--agent',
    'claude',
    '--branch=child-branch',
    '--',
    'lantern-cove',
  ]);
});

test('selected session can fork its native conversation in place or into a worktree', async () => {
  const source = managedRow('parent01');
  const rows = [source];
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(rows),
    fork: () => {
      const created = managedRow('fork0001', { parent: source.id });
      rows.push(created);
      return envelope(created);
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const actions = () => document.querySelector('[aria-label="Session actions"]') as HTMLElement;
  const action = (label: string) =>
    [...(actions().parentElement?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes(label),
    );
  await click(actions());
  await click(action('Fork session'));
  expect(calls).toContainEqual(['--json', 'fork', '--', source.id]);
  await click(byTestId('sidebar-session')[0]);
  await click(actions());
  await click(action('Fork into worktree'));
  expect(byTestId('fork-dialog')).toHaveLength(1);
  (byTestId('fork-branch')[0] as HTMLInputElement).value = 'try/fork';
  await click(byTestId('fork-submit')[0]);
  expect(calls).toContainEqual(['--json', 'fork', '--branch=try/fork', '--', source.id]);
});

test('project controls update profile presentation and leave the slug available when hidden', async () => {
  let rows = PROJECTS.map((row) => ({ ...row }));
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(rows),
    'projects update': (args) => {
      const name = args.at(-1);
      rows = rows.map((row) =>
        row.name === name
          ? {
              ...row,
              label: args.find((arg) => arg.startsWith('--label='))?.slice(8) ?? row.label,
              pinned: args.includes('--pinned') ? args.includes('true') : row.pinned,
              hidden: args.includes('--hidden') ? args.includes('true') : row.hidden,
            }
          : row,
      );
      return envelope({ name, path: rows[0]?.path });
    },
    unregister: () => {
      rows = rows.filter((row) => row.name !== 'lantern-cove');
      return envelope({ name: 'lantern-cove', path: '/src/lantern-cove' });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  const action = (label: string) =>
    [...(byTestId('project-menu')[0]?.parentElement?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.includes(label),
    );
  await click(action('Rename display label'));
  (document.querySelector('#project-label') as HTMLInputElement).value = 'Lantern Cove';
  await click(byTestId('save-project-label')[0]);
  expect(byTestId('project-workspace')[0]?.textContent).toContain('Lantern Cove');
  expect(byTestId('project-workspace')[0]?.textContent).toContain(
    'lantern-cove · /src/lantern-cove',
  );
  await click(action('Pin project'));
  expect(calls).toContainEqual([
    '--json',
    'projects',
    'update',
    '--pinned',
    'true',
    '--',
    'lantern-cove',
  ]);
  await click(action('Hide project'));
  expect(byTestId('sidebar-project').map((element) => element.textContent)).toEqual(['tide']);
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('project-row')[0]?.textContent).toContain('Hidden');
  expect(byTestId('project-row')[0]?.textContent).toContain('lantern-cove');
  await click(byTestId('project-row')[0]?.querySelector('button') as HTMLElement);
  await click(action('Unregister project'));
  expect(byTestId('project-unregister-dialog')).toHaveLength(1);
  await click(byTestId('confirm-unregister-project')[0]);
  expect(calls).toContainEqual(['--json', 'unregister', '--', 'lantern-cove']);
  expect(byTestId('projects-screen')).toHaveLength(1);
});

test('Search Mesa opens with Cmd+K, filters destinations, and navigates with Enter', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(1);
  const input = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    input.value = 'lantern';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(byTestId('palette-hit').map((hit) => hit.textContent)).toEqual([
    'lantern-covelantern-cove · /src/lantern-cove',
    'aaaaaaaalantern-cove · claude · working',
  ]);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(byTestId('project-workspace')).toHaveLength(1);
  await click(byTestId('search-trigger')[0]);
  const again = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    again.value = 'lantern';
    again.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await act(async () => {
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(byTestId('selected-session')).toHaveLength(1);
});

test('Search Mesa shows no matches and Escape returns keyboard focus', async () => {
  const byTestId = await renderWithMesa(<App />, fakeBridge().bridge);
  const trigger = byTestId('search-trigger')[0];
  trigger?.focus();
  await click(trigger);
  const input = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    input.value = 'nothing-matches';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(byTestId('palette-empty')).toHaveLength(1);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(0);
  expect(document.activeElement).toBe(trigger);
});

test('Search Mesa disables New session when no project can start, and opens it when one can', async () => {
  const empty = await renderWithMesa(<App />, fakeBridge().bridge);
  await click(empty('search-trigger')[0]);
  expect(
    empty('palette-hit')
      .find((hit) => hit.textContent?.includes('New session'))
      ?.hasAttribute('disabled'),
  ).toBe(true);
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('search-trigger')[0]);
  await click(byTestId('palette-hit').find((hit) => hit.textContent?.includes('New session')));
  expect(byTestId('new-session-dialog')).toHaveLength(1);
});

test('shortcut settings validate conflicts and update the active profile key', async () => {
  let shortcuts = { ...DEFAULT_SHORTCUTS } as Config['shortcuts'];
  const config = (): Config => ({
    vault: '/h/vault',
    defaultAgent: 'claude',
    skills: [],
    decisions: { backend: 'adapter', adapter: 'claude', threshold: 0.7 },
    sessions: { log: true },
    terminal: { app: 'Terminal' },
    editor: { fontSize: 13, tabSize: 2, wordWrap: false, vim: false, external: [] },
    worktrees: {
      location: 'profile',
      fetch: false,
      sparseDirectories: [],
      carryIgnoredDirectories: [],
      setup: [],
      teardown: [],
    },
    shortcuts,
    board: { view: 'list', group: 'none', density: 'comfortable', sort: 'attention', order: [] },
    grid: { groups: [] },
    run: { permissionMode: 'acceptEdits', allowedTools: [] },
    keys: {},
  });
  const { bridge, calls } = fakeBridge({
    config: () => envelope(config()),
    'config set': (args) => {
      const value = JSON.parse(args.at(-1) ?? '""');
      shortcuts = { ...shortcuts, search: value };
      return envelope({ path: 'shortcuts.search', value });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-shortcuts')[0]);
  const input = byTestId('shortcut-search')[0] as HTMLInputElement;
  const type = async (value: string) =>
    act(async () => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await type('Mod+Q');
  expect(byTestId('save-shortcut-search')[0]?.hasAttribute('disabled')).toBe(true);
  await type('Mod+1');
  expect(byTestId('save-shortcut-search')[0]?.hasAttribute('disabled')).toBe(true);
  await type('Mod+P');
  await click(byTestId('save-shortcut-search')[0]);
  expect(calls).toContainEqual(['--json', 'config', 'set', '--', 'shortcuts.search', '"Mod+P"']);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(0);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
  });
  expect(byTestId('command-palette')).toHaveLength(1);
});

test('the header shows the profile, the vault path, and a green or red doctor verdict', async () => {
  const healthy = await renderWithMesa(<App />, fakeBridge().bridge);
  expect(healthy('profile-summary')[0]?.textContent).toBe(
    'Profile: default | Vault: /h/vault Open in Obsidian | Doctor: ok',
  );
  // The verdict's colour comes from its data-health (theme tokens), not an inline style.
  expect(healthy('doctor-health')[0]?.dataset.health).toBe('healthy');

  const sick = fakeBridge({
    doctor: () =>
      envelope(
        report([{ name: 'tmux', ok: false, status: 'fail', hint: '' }], {
          healthy: false,
          summary: 'nothing can run without tmux',
        }),
      ),
    'vault status': () => envelope({ path: '/h/vault', ok: false, missing: ['receipts'] }),
  });
  const byTestId = await renderWithMesa(<App />, sick.bridge);
  expect(byTestId('vault-status')[0]?.textContent).toBe('Vault: /h/vault (missing receipts)');
  expect(byTestId('doctor-health')[0]?.textContent).toBe('Doctor: needs attention');
  expect(byTestId('doctor-health')[0]?.dataset.health).toBe('unhealthy');
});

test('every distinct failure shows once in the toast', async () => {
  const notInit = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge } = fakeBridge({
    config: () => notInit,
    'vault status': () => notInit,
    projects: () => notInit,
    doctor: () => {
      throw new Error('mesa exited with code 1: boom');
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(toastTexts(byTestId).sort()).toEqual([
    'config.yaml not found; run mesa init --vault <path>',
    'mesa exited with code 1: boom',
  ]);
});

test('the log box sends its line to mesa log and shows the entry', async () => {
  const { bridge, calls } = fakeBridge({
    log: (args) =>
      envelope({
        entry: `- 2026-09-24T12:00:00.000Z ${args.at(-1)}`,
        daily: 'daily/2026-09-24.md',
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const input = byTestId('log-input')[0] as HTMLInputElement;
  input.value = 'shipped #12';
  await click(byTestId('log-submit')[0]);
  expect(calls).toContainEqual(['--json', 'log', '--', 'shipped #12']);
  expect(byTestId('log-last')[0]?.textContent).toBe('- 2026-09-24T12:00:00.000Z shipped #12');
  expect(input.value).toBe('');
});

test('Enter twice while a line is being logged logs it once', async () => {
  let release = () => {};
  const { bridge, calls } = fakeBridge({
    log: () =>
      new Promise((done) => {
        release = () => done(envelope({ entry: '- shipped', daily: 'daily/2026-09-24.md' }));
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  (byTestId('log-input')[0] as HTMLInputElement).value = 'shipped #12';
  const form = byTestId('log-box')[0] as HTMLFormElement;
  await act(async () => form.requestSubmit());
  await act(async () => form.requestSubmit());
  await act(async () => release());
  expect(calls.filter((c) => c[1] === 'log')).toHaveLength(1);
});

test('Open in Obsidian runs mesa vault open; a failure shows in the toast', async () => {
  const { bridge, calls } = fakeBridge({
    'vault open': () =>
      envelope({ opened: true, method: 'uri', target: 'obsidian://open?vault=vault' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('open-vault')[0]);
  expect(calls).toContainEqual(['--json', 'vault', 'open']);
  expect(byTestId('toast')).toHaveLength(0);

  const unknown = fakeBridge({
    'vault open': () =>
      failure(
        'Obsidian does not know the vault /h/vault yet: open it once with "Open folder as vault" in Obsidian, then retry',
      ),
  });
  const again = await renderWithMesa(<App />, unknown.bridge);
  await click(again('open-vault')[0]);
  expect(again('toast')[0]?.textContent).toContain('Open folder as vault');
});

/** Types `prompt` into the first row's Send box and sends it. */
async function send(byTestId: (id: string) => HTMLElement[], prompt: string) {
  (byTestId('session-prompt')[0] as HTMLInputElement).value = prompt;
  await click(byTestId('session-send-submit')[0]);
}

test('a confirmation is neutral, shows every time, and goes by itself', async () => {
  vi.useFakeTimers();
  try {
    const { bridge } = fakeBridge({
      sessions: () => envelope([managedRow('aaaaaaaa')]),
      send: () => envelope({ sent: true, session: 'aaaaaaaa', from: null, chars: 5 }),
    });
    const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
    await send(byTestId, 'hello');
    await send(byTestId, 'hello');
    expect(toasts(byTestId)).toEqual([
      ['confirmation', 'Sent 5 characters to aaaaaaaa'],
      ['confirmation', 'Sent 5 characters to aaaaaaaa'],
    ]);
    await act(async () => vi.advanceTimersByTime(CONFIRMATION_MS));
    expect(toasts(byTestId)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('a failure, or a confirmation with a warning, is an alert: warm, once, and it stays', async () => {
  vi.useFakeTimers();
  try {
    let fails = true;
    const { bridge } = fakeBridge({
      sessions: () => envelope([managedRow('aaaaaaaa')]),
      send: () =>
        fails
          ? failure('session aaaaaaaa waits on a person')
          : envelope({
              sent: true,
              session: 'aaaaaaaa',
              from: null,
              chars: 5,
              warning: 'no receipt',
            }),
    });
    const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
    await send(byTestId, 'hello');
    await send(byTestId, 'hello');
    fails = false;
    await send(byTestId, 'hello');
    await act(async () => vi.advanceTimersByTime(2 * CONFIRMATION_MS));
    expect(toasts(byTestId)).toEqual([
      ['alert', 'session aaaaaaaa waits on a person'],
      ['alert', 'Sent 5 characters to aaaaaaaa; no receipt'],
    ]);
  } finally {
    vi.useRealTimers();
  }
});

test('a native Mesa project link opens the validated clone form and waits for confirmation', async () => {
  const link = 'mesa://clone?url=https%3A%2F%2Fexample.com%2Fteam%2Flantern-cove.git';
  let opened: (urls: string[]) => void = () => {};
  const { bridge, calls } = fakeBridge({
    'projects clone': () =>
      envelope({ name: 'lantern-cove', path: '/tmp/lantern-cove', created: true, receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({
      deepLinks: {
        current: async () => [link],
        onOpen: async (handler) => {
          opened = handler;
          return () => {};
        },
      },
    }),
  );
  expect(byTestId('projects-screen')).toHaveLength(1);
  expect((byTestId('repository-url')[0] as HTMLInputElement).value).toBe(link);
  expect(calls.some((args) => args[1] === 'projects' && args[2] === 'clone')).toBe(false);
  await click(byTestId('clone-project')[0]);
  expect(
    calls.filter((args) => args.join(' ') === `--json projects clone -- ${link}`),
  ).toHaveLength(1);
  await act(async () => opened([link]));
  expect((byTestId('repository-url')[0] as HTMLInputElement).value).toBe(link);
});

test('a failed native project link can be opened again', async () => {
  const link = 'mesa://clone?url=https%3A%2F%2Fexample.com%2Fretry.git';
  const { bridge, calls } = fakeBridge({
    'projects clone': () => failure('git clone failed: offline'),
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({
      deepLinks: {
        current: async () => [link],
        onOpen: async () => () => {},
      },
    }),
  );
  await click(byTestId('clone-project')[0]);
  expect((byTestId('repository-url')[0] as HTMLInputElement).value).toBe(link);
  await click(byTestId('clone-project')[0]);
  expect(
    calls.filter((args) => args.join(' ') === `--json projects clone -- ${link}`),
  ).toHaveLength(2);
  await click(document.querySelector('[aria-label="Cancel repository checkout"]') as HTMLElement);
  expect((byTestId('repository-url')[0] as HTMLInputElement).value).toBe('');
});
