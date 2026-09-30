// @vitest-environment happy-dom
import type { Config, TreeRow } from '@mesa/core';
import { DEFAULT_SHORTCUTS, GENERAL_PROJECT } from '@mesa/core/browser';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from '@/App';
import { CONFIRMATION_MS } from '@/components/Toast';
import {
  choose,
  click,
  deferred,
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
  await click(
    [...(byTestId('skills-workspace')[0]?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Coding agents',
    ),
  );
  expect(byTestId('doctor-panel')).toHaveLength(1);
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('projects-screen')).toHaveLength(1);
});

test('project Skills and Rules tabs preview and save only through their checked commands', async () => {
  const skillId = '/src/lantern-cove/.claude/skills/sunset-map';
  const ruleId = '/src/lantern-cove/AGENTS.md';
  const revision = 'a'.repeat(64);
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([]),
    'skills list': () =>
      envelope([
        {
          id: skillId,
          path: skillId,
          name: 'sunset-map',
          description: 'Fictional map',
          source: 'repo',
          scope: 'project',
          providers: ['claude'],
          enabled: true,
          supportFiles: ['reference.md'],
          writable: true,
          conflicts: [],
        },
      ]),
    'skills read': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: skillId, registered: false },
        path: 'SKILL.md',
        text: '# Sunset map\n',
        revision,
        lines: 2,
      }),
    'skills write': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: skillId, registered: false },
        path: 'SKILL.md',
        action: 'write',
        revision: 'b'.repeat(64),
        receipt: null,
      }),
    'rules list': () =>
      envelope([
        {
          id: ruleId,
          path: ruleId,
          name: 'AGENTS.md',
          scope: 'project',
          providers: ['claude', 'codex', 'antigravity'],
          writable: true,
        },
      ]),
    'rules read': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/src/lantern-cove', registered: false },
        path: 'AGENTS.md',
        text: '# Rules\n',
        revision,
        lines: 2,
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'skills',
    ),
  );
  expect(byTestId('skills-workspace')[0]?.textContent).toContain('sunset-map');
  expect(byTestId('skills-workspace')[0]?.textContent).not.toContain('Run skill');
  await click(
    [
      ...(byTestId('skills-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent?.includes('sunset-map')),
  );
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).value).toBe('# Sunset map\n');
  await act(async () => {
    const editor = byTestId('file-editor-text')[0] as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      editor,
      '# Updated map\n',
    );
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    [
      ...(byTestId('skills-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent === 'Save'),
  );
  expect(calls).toContainEqual([
    '--json',
    'skills',
    'write',
    '--project',
    'lantern-cove',
    '--file',
    'SKILL.md',
    '--text=# Updated map\n',
    '--revision',
    revision,
    '--',
    skillId,
  ]);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'rules',
    ),
  );
  expect(byTestId('rules-workspace')[0]?.textContent).toContain('AGENTS.md');
  await click(
    [...(byTestId('rules-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (b) => b.textContent?.includes('AGENTS.md'),
    ),
  );
  expect((byTestId('file-editor-text')[0] as HTMLTextAreaElement).value).toBe('# Rules\n');
  expect(calls).toContainEqual([
    '--json',
    'rules',
    'read',
    '--project',
    'lantern-cove',
    '--',
    ruleId,
  ]);
});

test('project Skills can enable a shipped skill through the project policy and sync it', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'skills list': () =>
      envelope([
        {
          id: '/library/session-summary',
          path: '/library/session-summary',
          name: 'session-summary',
          description: 'Summarize an invented session',
          source: 'mesa',
          scope: 'mesa',
          providers: ['claude', 'codex', 'antigravity'],
          enabled: false,
          supportFiles: [],
          writable: false,
          conflicts: [],
          disabledFor: [],
          precedence: 'only-discovered-source',
        },
      ]),
    'skills read': () =>
      envelope({ path: 'SKILL.md', text: '# Summary\n', revision: 'a'.repeat(64), lines: 2 }),
    'skills set': () =>
      envelope({ project: 'lantern-cove', name: 'session-summary', enabled: true }),
    'skills sync': () => envelope({ added: [], removed: [], kept: [], conflicts: [], unknown: [] }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'skills',
    ),
  );
  await click(
    [
      ...(byTestId('skills-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent?.includes('session-summary')),
  );
  await click(
    [
      ...(byTestId('skills-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent === 'Enable in project'),
  );
  expect(calls).toContainEqual([
    '--json',
    'skills',
    'set',
    '--enabled',
    'true',
    '--',
    'lantern-cove',
    'session-summary',
  ]);
  expect(calls).toContainEqual(['--json', 'skills', 'sync', '--', 'lantern-cove']);
});

test('project Skills does not offer to disable a skill inherited from the profile', async () => {
  const defaults = (await fakeBridge().bridge(['--json', 'config', 'get'])) as {
    data: Config;
  };
  const { bridge } = fakeBridge({
    projects: () => envelope([{ ...PROJECTS[0], skills: ['session-summary'] }]),
    config: () => envelope({ ...defaults.data, skills: ['session-summary'] }),
    'skills list': () =>
      envelope([
        {
          id: '/library/session-summary',
          path: '/library/session-summary',
          name: 'session-summary',
          description: 'Summarize a session',
          source: 'mesa',
          scope: 'mesa',
          providers: ['claude', 'codex', 'antigravity'],
          enabled: true,
          supportFiles: [],
          writable: false,
          conflicts: [],
        },
      ]),
    'skills read': () =>
      envelope({ path: 'SKILL.md', text: '# Summary\n', revision: 'a'.repeat(64), lines: 2 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'skills'));
  await click(
    [
      ...(byTestId('skills-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent?.includes('session-summary')),
  );
  const text = byTestId('skills-workspace')[0]?.textContent ?? '';
  expect(text).toContain('Remove project override');
  expect(text).toContain('Enabled by the profile in every project.');
  expect(text).not.toContain('Disable in project');
});

test('project Skills lists the vault and Obsidian skills Mesa ships, with their NOTICE', async () => {
  const shipped = (name: string, enabled: boolean, supportFiles: string[]) => ({
    id: `/library/${name}`,
    path: `/library/${name}`,
    name,
    description: `The invented ${name} skill`,
    source: 'mesa',
    scope: 'mesa',
    providers: ['claude', 'codex', 'antigravity'],
    enabled,
    supportFiles,
    writable: false,
    readOnlyReason: 'Mesa ships this skill',
    conflicts: [],
    disabledFor: [],
    precedence: 'only-discovered-source',
  });
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'skills list': () =>
      envelope([
        shipped('json-canvas', false, ['NOTICE', 'references/EXAMPLES.md']),
        shipped('mesa-vault', true, []),
        shipped('obsidian-bases', false, ['NOTICE', 'references/FUNCTIONS_REFERENCE.md']),
        shipped('obsidian-cli', false, ['NOTICE']),
        shipped('obsidian-markdown', false, ['NOTICE', 'references/CALLOUTS.md']),
      ]),
    'skills read': () =>
      envelope({ path: 'SKILL.md', text: '# Obsidian CLI\n', revision: 'a'.repeat(64), lines: 2 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'skills'));
  const card = (name: string) =>
    [
      ...(byTestId('skills-workspace')[0]?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((b) => b.textContent?.startsWith(name));
  expect(card('mesa-vault')?.textContent).toContain('mesa-vaultEnabled');
  for (const name of ['obsidian-markdown', 'obsidian-bases', 'json-canvas', 'obsidian-cli']) {
    expect(card(name)?.textContent).toContain(`${name}Off`);
  }
  await click(card('obsidian-cli'));
  const text = byTestId('skills-workspace')[0]?.textContent ?? '';
  expect(text).toContain('Read-only: Mesa ships this skill');
  expect(
    [...(byTestId('skills-workspace')[0]?.querySelectorAll('button') ?? [])].map(
      (b) => b.textContent,
    ),
  ).toEqual(expect.arrayContaining(['SKILL.md', 'NOTICE', 'Enable in profile']));
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

test("a note in the project's vault overview opens in the Vault screen, selected", async () => {
  const note = {
    path: 'wiki/currents.md',
    kind: 'markdown',
    category: 'wiki',
    project: 'lantern-cove',
    size: 10,
    modified: '2026-09-24T12:00:00.000Z',
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'vault context': () =>
      envelope({
        project: 'lantern-cove',
        hub: null,
        index: [],
        notes: [{ path: note.path, title: 'Currents', modified: note.modified }],
        decisions: [],
        goals: [],
        more: '',
      }),
    'vault list': () => envelope({ vault: '/h/vault', total: 1, items: [note] }),
    'vault read': () =>
      envelope({
        ...note,
        uri: 'obsidian://open?vault=vault&file=wiki%2Fcurrents.md',
        backlinks: [],
        preview: 'markdown',
        frontmatter: {},
        body: '# Currents\n',
        links: [],
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('sidebar-project')[0]);
  await click(byTestId('vault-overview-note')[0]);
  expect(byTestId('vault-panel')).toHaveLength(1);
  expect(byTestId('vault-item')[0]?.querySelector('[data-fact="Path"]')?.textContent).toBe(
    'wiki/currents.md',
  );
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'wiki/currents.md']);
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
  expect(
    calls.some(
      (args) => args.includes('drop') && args.includes('stash@{0}') && args.includes('--oid=abc'),
    ),
  ).toBe(true);
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

test('Sessions selects a newly discovered managed session after initially seeing only foreign rows', async () => {
  let rows: TreeRow[] = [foreignRow];
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(rows),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('selected-session')).toHaveLength(0);
  rows = [foreignRow, managedRow('aaaaaaaa')];
  await act(async () => new Promise((resolve) => setTimeout(resolve, 2100)));
  expect(byTestId('selected-session')).toHaveLength(1);
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
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
    'aaaaaaaaworking',
    'bbbbbbbbworking',
  ]);
  await click(byTestId('sidebar-session')[1]);
  expect(byTestId('selected-session')[0]?.textContent).toContain('bbbbbbbb');
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

test('Sessions sidebar shows a branch, compact control, and child action', async () => {
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
  await click(document.querySelector('[aria-label="Compact aaaaaaaa card"]') as HTMLElement);
  expect(card()?.textContent).toBe('aaaaaaaa');
  expect(byTestId('selected-session')).toHaveLength(1);
  await click(document.querySelector('[aria-label="Expand aaaaaaaa card"]') as HTMLElement);
  expect(card()?.textContent).toContain('feature');
  expect(card()?.textContent).toContain('working');
  await click(
    document.querySelector(
      '[aria-label="New child session from aaaaaaaa (aaaaaaaa)"]',
    ) as HTMLElement,
  );
  expect(byTestId('new-session-dialog')[0]?.textContent).toContain('New worktree session');
  expect((byTestId('new-session-project')[0] as HTMLInputElement).readOnly).toBe(true);
});

test('unnamed sessions are told apart by their goal, else their id, and idle is not warm', async () => {
  const idle = { state: 'idle' as const, confidence: 0.9, at: '2026-09-25T12:00:00.000Z' };
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([
        managedRow('aaaaaaaa', { goal: '\n  Fix the login redirect\nthen run the tests' }),
        managedRow('bbbbbbbb', { name: 'Review', goal: 'Not shown' }),
        managedRow('cccccccc'),
        managedRow('dddddddd', { lastState: { ...idle, source: 'hook' } }),
      ]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const titles = ['Fix the login redirect', 'Review', 'cccccccc', 'dddddddd'];
  const cards = byTestId('sidebar-session');
  expect(cards.map((card) => card.querySelector('.truncate')?.textContent)).toEqual(titles);
  const icon = cards[3]?.querySelector('svg');
  expect(icon?.classList.contains('text-state-waiting')).toBe(false);
  expect(icon?.classList.contains('text-state-idle')).toBe(true);
  await click(cards[0]);
  expect(byTestId('selected-session')[0]?.textContent).toContain('Fix the login redirect');
  expect(
    document.querySelector('[aria-label="Archive Fix the login redirect (aaaaaaaa)"]'),
  ).not.toBeNull();
  await click(byTestId('sidebar-project')[0]);
  expect(byTestId('project-active-session').map((card) => card.getAttribute('aria-label'))).toEqual(
    titles.map(
      (title, i) => `Open ${title} (${['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'][i]})`,
    ),
  );
});

test('Sessions sidebar menu opens the selected session dependency editor', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(
    document.querySelector('[aria-label="More actions for aaaaaaaa (aaaaaaaa)"]') as HTMLElement,
  );
  const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  expect(options.map((item) => item.textContent)).toEqual([
    'New terminal session',
    'New child worktree session',
    'Set dependency',
  ]);
  await click(options[2]);
  expect(byTestId('dependency-dialog')[0]?.textContent).toContain('Set dependency for aaaaaaaa');
});

test('General session menu can start a child terminal without a project', async () => {
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa', { project: GENERAL_PROJECT })]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(
    document.querySelector('[aria-label="More actions for aaaaaaaa (aaaaaaaa)"]') as HTMLElement,
  );
  const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  expect(options.map((item) => item.textContent)).toEqual([
    'New terminal session',
    'Set dependency',
  ]);
  await click(options[0]);
  expect(byTestId('new-session-dialog')[0]?.textContent).toContain('New terminal session');
  expect(byTestId('new-session-project')).toHaveLength(0);
});

test('selected session details read native context by exact id and keep unknown facts honest', async () => {
  const row = managedRow('aaaaaaaa', { attention: 0.83 });
  let reading = true;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row]),
    show: () =>
      envelope(
        reading
          ? {
              ...row,
              instructions: { state: 'configured', reason: 'SessionStart hook is configured' },
              vault: { state: 'configured', reason: 'mesa-vault is mounted in its launch command' },
              context: {
                used: 57.56,
                window: 258400,
                at: '2026-09-27T12:01:00.000Z',
                source: 'transcript',
                model: 'claude-opus-5-5',
                effort: 'xhigh',
              },
            }
          : {
              ...row,
              instructions: { state: 'missing', reason: 'Run mesa hooks install' },
              vault: { state: 'unsupported', reason: 'A plain terminal runs no agent' },
            },
      ),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  const details = byTestId('selected-session-details')[0];
  expect(calls).toContainEqual(['--json', 'show', '--', 'aaaaaaaa']);
  expect(details?.textContent).toContain('/src/lantern-cove');
  expect(details?.textContent).toContain('Modelclaude-opus-5-5');
  expect(details?.textContent).toContain('Effortxhigh');
  expect(details?.textContent).toContain('Confidence95%');
  expect(details?.textContent).toContain('Attention0.83');
  expect(details?.textContent).toContain('Instructionsconfigured: SessionStart hook is configured');
  expect(details?.textContent).toContain(
    'Vaultconfigured: mesa-vault is mounted in its launch command',
  );
  expect(details?.textContent).toContain('58% of 258,400 tokens');
  expect(details?.textContent).toContain('transcript');
  const ring = document.querySelector('[aria-label="Context window: 58%"]');
  expect(ring?.getAttribute('role')).toBe('progressbar');
  // The Board's context bar tones: amber from 55%.
  expect(ring?.getAttribute('data-tone')).toBe('amber');
  reading = false;
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(details?.textContent).toContain('ContextUnknown');
  expect(details?.textContent).toContain('ModelUnknown');
  expect(details?.textContent).toContain('EffortUnknown');
  expect(details?.textContent).toContain('Instructionsmissing: Run mesa hooks install');
  expect(details?.textContent).toContain('Vaultunsupported: A plain terminal runs no agent');
  expect(
    document.querySelector('[aria-label="Context window: unknown"]')?.getAttribute('role'),
  ).toBe('img');
});

test("selected session details list the vault server's tools for an agent session", async () => {
  const schema = { type: 'object', properties: {}, additionalProperties: false };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa', { agent: 'codex' })]),
    show: () =>
      envelope({
        ...managedRow('aaaaaaaa', { agent: 'codex' }),
        instructions: { state: 'configured', reason: 'SessionStart hook is configured' },
        vault: { state: 'configured', reason: 'mesa-vault is mounted in its launch command' },
      }),
    'vault mcp': () =>
      envelope({
        tools: [
          { name: 'read_note', description: 'Read one invented item.', inputSchema: schema },
          { name: 'save_note', description: 'Save one invented note.', inputSchema: schema },
        ],
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const tools = byTestId('session-vault-tools')[0];
  expect(tools?.textContent).toBe('Open details to check');
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(calls).toContainEqual(['--json', 'vault', 'mcp', '--tools']);
  expect([...(tools?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
    'read_note',
    'save_note',
  ]);
  expect(tools?.querySelector('[title="Save one invented note."]')?.textContent).toBe('save_note');
});

test('selected session details say a plain terminal has no vault tools, and ask for none', async () => {
  const row = managedRow('aaaaaaaa', { agent: 'terminal' });
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([row]),
    show: () =>
      envelope({
        ...row,
        instructions: { state: 'unsupported', reason: 'A plain terminal' },
        vault: { state: 'unsupported', reason: 'A plain terminal runs no agent' },
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Session details"]') as HTMLElement);
  expect(byTestId('session-vault-tools')[0]?.textContent).toBe(
    'None: a plain terminal runs no agent',
  );
  // The mount status sits beside the tools its server lists.
  expect(byTestId('selected-session-details')[0]?.textContent).toContain(
    'Vaultunsupported: A plain terminal runs no agent',
  );
  expect(calls.filter((argv) => argv[1] === 'vault' && argv[2] === 'mcp')).toEqual([]);
});

test("a selected session's context ring stops at 100% and turns red, as the Board's bar does", async () => {
  const context = {
    used: 120.4,
    window: 200000,
    at: '2026-09-27T12:01:00.000Z',
    source: 'transcript' as const,
  };
  const { bridge } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa', { context })]),
  });
  await renderWithMesa(<App />, bridge);
  const ring = document.querySelector('[aria-label="Context window: 100%"]');
  expect(ring?.getAttribute('aria-valuenow')).toBe('100');
  expect(ring?.getAttribute('data-tone')).toBe('red');
});

test('selected-session image preview can be removed or sent only to the selected Claude session', async () => {
  const path = '/tmp/invented.png';
  const image = {
    profile: 'default',
    session: 'aaaaaaaa',
    path,
    name: 'invented.png',
    mime: 'image/png',
    bytes: 68,
    revision: 'a'.repeat(64),
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb')]),
    'image preview': () => envelope(image),
    'image send': () => envelope({ sent: true, session: 'aaaaaaaa', chars: 90 }),
  });
  const byTestId = await renderWithMesa(<App />, bridge, fakePlatform({ file: path }));
  await click(document.querySelector('[aria-label="Attach image"]') as HTMLElement);
  expect(calls).toContainEqual(['--json', 'image', 'preview', '--', 'aaaaaaaa', path]);
  expect(document.querySelector('img[alt="Selected image: invented.png"]')).not.toBeNull();
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Remove image',
    ),
  );
  expect(document.querySelector('img[alt="Selected image: invented.png"]')).toBeNull();
  expect(calls.some((args) => args[1] === 'image' && args[2] === 'send')).toBe(false);

  await click(document.querySelector('[aria-label="Attach image"]') as HTMLElement);
  await click(byTestId('sidebar-session')[1]);
  expect(document.querySelector('img[alt="Selected image: invented.png"]')).toBeNull();
  await click(byTestId('sidebar-session')[0]);
  await click(document.querySelector('[aria-label="Attach image"]') as HTMLElement);
  const form = document.querySelector('[aria-label="Prompt for aaaaaaaa"]')?.closest('form');
  expect(form).not.toBeNull();
  await act(async () => form?.requestSubmit());
  expect(calls).toContainEqual([
    '--json',
    'image',
    'send',
    '--no-from',
    '--revision',
    image.revision,
    '--profile',
    'default',
    '--',
    'aaaaaaaa',
    path,
  ]);
  expect(document.querySelector('img[alt="Selected image: invented.png"]')).toBeNull();
});

test('selected session reviews an exact native response passage beside its running terminal', async () => {
  const row = {
    profile: 'default',
    session: 'aaaaaaaa',
    agent: 'claude',
    nativeSessionId: 'invented-native-id',
    source: 'a'.repeat(64),
    revision: 'b'.repeat(64),
    text: 'A violet otter.',
    truncated: false,
  };
  const preview = {
    id: 'c'.repeat(64),
    target: 'aaaaaaaa',
    source: row.source,
    revision: row.revision,
    passage: 'violet otter',
    comment: 'Check this claim.',
    prompt: 'Review this exact passage',
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    'review responses': () => envelope({ rows: [row], reviews: [], truncated: false }),
    'review preview': () => envelope(preview),
    'review send': () => envelope({ id: preview.id, target: 'aaaaaaaa', status: 'delivered' }),
  });
  const platform = fakePlatform();
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  await click(document.querySelector('[aria-label="Review responses"]') as HTMLElement);
  expect(byTestId('terminal-panel')).toHaveLength(1);
  const review = document.querySelector('[aria-label="Response review"]') as HTMLElement;
  expect(review.textContent).toContain('A violet otter.');
  await click(review.querySelector('[aria-label="Copy response"]') as HTMLElement);
  expect(platform.pasteboard).toEqual(['A violet otter.']);
  await click(
    [...review.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'A violet otter.',
    ),
  );
  const passage = review.querySelector('#review-response-text') as HTMLTextAreaElement;
  await act(async () => {
    passage.focus();
    passage.setSelectionRange(2, 14);
    passage.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
  });
  const comment = review.querySelector('#review-comment') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      comment,
      'Check this claim.',
    );
    comment.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(review.textContent).toContain('Selected characters: 12');
  expect(comment.value).toBe('Check this claim.');
  const previewButton = [...review.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Preview review',
  );
  expect(previewButton?.disabled).toBe(false);
  await click(previewButton);
  expect(byTestId('response-review-preview')[0]?.textContent).toContain(preview.prompt);
  await click(
    [...review.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Send review'),
    ),
  );
  expect(
    calls.some(
      (args) =>
        args[1] === 'review' &&
        args[2] === 'send' &&
        args.includes('--selection-profile') &&
        args.includes('aaaaaaaa'),
    ),
  ).toBe(true);
  expect(byTestId('response-review-preview')[0]?.textContent).toContain('Delivered');
});

test('selected session reviews a Git hunk beside its running terminal', async () => {
  const change = {
    profile: 'default',
    session: 'aaaaaaaa',
    project: 'lantern-cove',
    checkout: '/tmp/lantern-cove',
    path: 'review.txt',
    staged: false,
    base: 'a'.repeat(40),
    source: 'b'.repeat(64),
    revision: 'c'.repeat(64),
    hunks: [{ index: 0, header: '@@ -1 +1 @@', text: '@@ -1 +1 @@\n-before\n+after\n' }],
  };
  const preview = {
    id: 'd'.repeat(64),
    target: 'aaaaaaaa',
    source: change.source,
    revision: change.revision,
    passage: change.hunks[0]?.text,
    comment: 'Please check this edit.',
    prompt: 'Review this exact Git hunk',
    path: change.path,
    base: change.base,
    staged: false,
  };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    'review responses': () => envelope({ rows: [], reviews: [], truncated: false }),
    'git status': () =>
      envelope({
        checkout: { project: 'lantern-cove', path: '/tmp/lantern-cove', registered: true },
        branch: 'main',
        changes: [{ path: 'review.txt', index: ' ', workingTree: 'M' }],
      }),
    'review changes': () => envelope(change),
    'review change-preview': () => envelope(preview),
    'review change-send': () =>
      envelope({ id: preview.id, target: 'aaaaaaaa', status: 'delivered' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="Review responses"]') as HTMLElement);
  const review = document.querySelector('[aria-label="Response review"]') as HTMLElement;
  await click(
    [...review.querySelectorAll('button')].find((button) => button.textContent === 'Changes'),
  );
  await click(
    [...review.querySelectorAll('button')].find((button) => button.textContent === 'review.txt'),
  );
  await click(
    [...review.querySelectorAll('button')].find((button) => button.textContent === '@@ -1 +1 @@'),
  );
  const comment = review.querySelector('#change-review-comment') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      comment,
      'Please check this edit.',
    );
    comment.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    [...review.querySelectorAll('button')].find(
      (button) => button.textContent === 'Preview review',
    ),
  );
  expect(byTestId('change-review-preview')[0]?.textContent).toContain(preview.prompt);
  await click(
    [...review.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Send review'),
    ),
  );
  expect(
    calls.some(
      (args) => args[1] === 'review' && args[2] === 'change-send' && args.includes('aaaaaaaa'),
    ),
  ).toBe(true);
  expect(byTestId('terminal-panel')).toHaveLength(1);
});

test('switching sessions while the image picker is open discards the old selection', async () => {
  let chooseFile!: (path: string) => void;
  const file = new Promise<string>((resolve) => {
    chooseFile = resolve;
  });
  const path = '/tmp/old-session.png';
  const platform = { ...fakePlatform(), pickFile: () => file };
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb')]),
  });
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  await click(document.querySelector('[aria-label="Attach image"]') as HTMLElement);
  await click(byTestId('sidebar-session')[1]);
  await act(async () => chooseFile(path));
  await click(byTestId('sidebar-session')[0]);
  expect(calls.some((args) => args[1] === 'image')).toBe(false);
  expect(document.querySelector('img[alt="Selected image: old-session.png"]')).toBeNull();
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
    document.querySelector('[aria-label="Archive aaaaaaaa (aaaaaaaa)"]') as HTMLElement;
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
  expect(byTestId('recoverable-sessions')[0]?.textContent).toContain('aaaaaaaa');
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
    open: () =>
      envelope({
        ...generalRow,
        warning:
          "Review and trust Mesa's hooks in Codex; this session starts without the Mesa pointer",
      }),
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
  expect(toasts(byTestId)).toContainEqual([
    'alert',
    "Opened session gener001 on General; Review and trust Mesa's hooks in Codex; this session starts without the Mesa pointer",
  ]);
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
  await click(document.querySelector('[aria-label="Archive gener001 (gener001)"]') as HTMLElement);
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
    `Search vault"lantern" in this profile's vault`,
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

test('Search Mesa offers Search vault for typed text, which opens the Vault screen searching it', async () => {
  const note = {
    path: 'wiki/tide.md',
    kind: 'markdown',
    category: 'wiki',
    size: 10,
    modified: '2026-09-24T12:00:00.000Z',
  };
  const { bridge, calls } = fakeBridge({
    'vault list': () => envelope({ vault: '/h/vault', total: 1, items: [note] }),
    'vault search': () => envelope({ total: 0, truncated: false, items: [] }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('search-trigger')[0]);
  const input = byTestId('palette-query')[0] as HTMLInputElement;
  await act(async () => {
    input.value = 'harbour lights';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Nothing else matches, so Enter chooses it.
  expect(byTestId('palette-empty')).toHaveLength(1);
  expect(byTestId('palette-hit').map((hit) => hit.textContent)).toEqual([
    `Search vault"harbour lights" in this profile's vault`,
  ]);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(byTestId('vault-panel')).toHaveLength(1);
  expect(document.querySelector<HTMLInputElement>('#vault-search')?.value).toBe('harbour lights');
  expect(calls).toContainEqual(['--json', 'vault', 'search', '--', 'harbour lights']);
  expect(byTestId('vault-results-said')[0]?.textContent).toBe('No items match "harbour lights".');
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

test('an action chosen in Search Mesa keeps the focus it moves: Profile and vault, on its menu', async () => {
  const byTestId = await renderWithMesa(<App />, fakeBridge().bridge);
  const trigger = byTestId('search-trigger')[0];
  trigger?.focus();
  await click(trigger);
  const profile = byTestId('palette-hit').find((hit) =>
    hit.textContent?.includes('Profile and vault'),
  );
  // Focused first, as Tab or a pointer press leaves it: the palette's focus trap now holds it.
  await act(async () => profile?.focus());
  await click(profile);
  // The dialog hands focus back on a timer once it closes: wait past it.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  const summary = document.activeElement as HTMLElement;
  expect(summary.tagName).toBe('SUMMARY');
  expect((summary.parentElement as HTMLDetailsElement).open).toBe(true);
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
    usage: { dailyAlertUsd: 0, weeklyAlertUsd: 0, monthlyAlertUsd: 0 },
    notifications: {
      quiet: false,
      inputRequired: 'sound',
      finished: 'silent',
      subagent: 'silent',
      doctor: 'silent',
    },
    application: { warnBeforeQuit: true, backupOnClose: false },
    onboarding: { status: 'complete', step: 0 },
    appearance: {
      theme: 'system',
      font: 'plex',
      fontSize: 16,
      density: 'comfortable',
      colorVision: 'normal',
    },
    terminal: {
      app: 'Terminal',
      theme: 'follow',
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      optionAsMeta: false,
      naturalSelection: false,
      scrollSpeed: 3,
      extraSubmitKey: 'none',
      newlineKey: 'native',
      wezTermNewTab: false,
    },
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

test('appearance preference saves through config and updates the live app theme', async () => {
  const baseline = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  let config = baseline.data;
  const { bridge, calls } = fakeBridge({
    config: () => envelope(config),
    'config set': (args) => {
      const value = JSON.parse(args.at(-1) ?? '""');
      config = { ...config, appearance: { ...config.appearance, theme: value } };
      return envelope({ path: 'appearance.theme', value });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-preferences')[0]);
  const theme = document.getElementById('appearance-theme') as HTMLSelectElement;
  await act(async () => {
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(calls).toContainEqual(['--json', 'config', 'set', '--', 'appearance.theme', '"dark"']);
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('a preference slider saves the value it is released on, once', async () => {
  const written = deferred();
  const { bridge, calls } = fakeBridge({ 'config set': () => written.promise });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-preferences')[0]);
  const slide = async (id: string, value: string) => {
    const slider = document.getElementById(id) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        slider,
        value,
      );
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return slider;
  };
  for (const value of ['17', '18', '19']) await slide('appearance-size', value);
  const slider = await slide('appearance-size', '20');
  expect(document.querySelector('label[for="appearance-size"]')?.textContent).toContain('20px');
  expect(calls.filter((args) => args[2] === 'set')).toEqual([]);
  await act(async () => slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await act(async () => written.resolve(envelope({ path: 'appearance.fontSize', value: 20 })));
  expect(calls.filter((args) => args[2] === 'set')).toEqual([
    ['--json', 'config', 'set', '--', 'appearance.fontSize', '20'],
  ]);
});

test('palette inserts a saved multiline prompt in the selected session without sending it', async () => {
  const text = 'Review this change\n\n  Keep the indentation.\n';
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    prompts: () => envelope([{ name: 'Review', text }]),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('selected-session')).toHaveLength(1);
  await click(byTestId('search-trigger')[0]);
  await click(
    byTestId('palette-hit').find((hit) => hit.textContent?.includes('Insert saved prompt')),
  );
  const field = document.querySelector('textarea[name="prompt"]') as HTMLTextAreaElement;
  expect(field.value).toBe(text);
  // Where the person can see it: the Session actions holding the field open, the field focused.
  expect(field.closest('details')?.open).toBe(true);
  expect(document.activeElement).toBe(field);
  expect(calls.some((args) => args.includes('send'))).toBe(false);
});

test('a saved prompt fills a new Claude session goal byte for byte without starting it', async () => {
  const text = 'First instruction\n\n  Keep this indentation.\n';
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    prompts: () => envelope([{ name: 'Review', text }]),
    open: () => envelope(managedRow('aaaaaaaa')),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(document.querySelector('[aria-label="New session in lantern-cove"]') as HTMLElement);
  await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]);
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent === 'Saved prompts',
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Review',
    ),
  );
  expect((byTestId('new-session-goal')[0] as HTMLTextAreaElement).value).toBe(text);
  expect(calls.some((args) => args[1] === 'open')).toBe(false);
  await click(byTestId('new-session-submit')[0]);
  const opened = calls.find((args) => args[1] === 'open');
  expect(opened).toContain(`--goal=${text}`);
});

test('quitting can be cancelled, and a failed close-time backup keeps the app open', async () => {
  const baseline = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  const config = { ...baseline.data, application: { warnBeforeQuit: true, backupOnClose: true } };
  let backupFails = true;
  let requestClose: ((event: { preventDefault: () => void }) => void) | undefined;
  let closes = 0;
  const platform = fakePlatform({
    lifecycle: {
      onCloseRequested: async (handler) => {
        requestClose = handler;
        return () => {};
      },
      close: async () => {
        closes++;
      },
    },
  });
  const { bridge, calls } = fakeBridge({
    config: () => envelope(config),
    'backup create': () =>
      backupFails ? failure('backup failed') : envelope({ path: '/invented/backup.json' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge, platform);
  const request = async () => act(async () => requestClose?.({ preventDefault: () => {} }));
  await request();
  expect(byTestId('quit-dialog')).toHaveLength(1);
  await click(byTestId('quit-dialog')[0]?.querySelector('button') ?? undefined);
  expect(byTestId('quit-dialog')).toHaveLength(0);
  expect(closes).toBe(0);
  expect(calls.some((args) => args.includes('backup'))).toBe(false);
  await request();
  await click(byTestId('confirm-quit')[0]);
  expect(closes).toBe(0);
  expect(byTestId('quit-dialog')).toHaveLength(1);
  backupFails = false;
  await click(byTestId('confirm-quit')[0]);
  expect(closes).toBe(1);
  expect(calls.filter((args) => args.includes('backup'))).toHaveLength(2);
});

test('welcome tour resumes, skips, and replays without starting an agent', async () => {
  const baseline = (await fakeBridge().bridge(['--json', 'config'])) as { data: Config };
  let config = { ...baseline.data, onboarding: { status: 'active' as const, step: 1 } };
  const { bridge, calls } = fakeBridge({
    config: () => envelope(config),
    'config set': (args) => {
      const path = args.at(-2) ?? '';
      const value = JSON.parse(args.at(-1) ?? 'null');
      config = {
        ...config,
        onboarding:
          path === 'onboarding'
            ? value
            : { ...config.onboarding, [path.split('.').at(-1) ?? '']: value },
      };
      return envelope({ path, value });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 2 of 3');
  const buttons = (testId: string) => [...(byTestId(testId)[0]?.querySelectorAll('button') ?? [])];
  await click(buttons('welcome-tour').find((button) => button.textContent === 'Next'));
  expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 3 of 3');
  await click(buttons('welcome-tour').find((button) => button.textContent === 'Skip tour'));
  expect(byTestId('welcome-tour')).toHaveLength(0);
  await click(byTestId('nav-preferences')[0]);
  await click(
    buttons('preferences').find((button) => button.textContent === 'Replay welcome tour'),
  );
  expect(byTestId('welcome-tour')[0]?.textContent).toContain('Step 1 of 3');
  expect(calls.some((args) => args.includes('open'))).toBe(false);
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

test('authorized native delivery and a click from before app launch open the exact session', async () => {
  const target = { kind: 'session' as const, id: 'aaaaaaaa' };
  const notice = {
    kind: 'notice' as const,
    id: '2026-09-24T12:00:01.000Z:abc123',
    ids: ['2026-09-24T12:00:01.000Z:abc123'],
    title: 'Session turn finished',
    body: 'Session aaaaaaaa',
    sound: false,
    target,
  };
  const sent: string[] = [];
  let opened:
    | ((destination: typeof target | { kind: 'inbox' } | { kind: 'doctor' }) => void)
    | undefined;
  const { bridge, calls } = fakeBridge({
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    'notifications delivery': () => envelope(notice),
    'notifications delivered': () => envelope({ ids: notice.ids, delivered: true }),
  });
  const byTestId = await renderWithMesa(
    <App startOnBoard />,
    bridge,
    fakePlatform({
      notifications: {
        status: async () => ({
          authorization: 'authorized',
          alertsEnabled: true,
          soundsEnabled: true,
        }),
        requestPermission: async () => {
          throw new Error('permission must be requested by a person');
        },
        send: async (item) => void sent.push(item.id),
        onOpen: async (handler) => {
          opened = handler;
          return () => {};
        },
        takeOpened: async () => target,
      },
    }),
  );
  expect(sent).toEqual([notice.id]);
  expect(calls.some((args) => args[1] === 'notifications' && args[2] === 'delivered')).toBe(true);
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  await act(async () => opened?.(target));
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(1);
  await act(async () => opened?.({ kind: 'doctor' }));
  expect(byTestId('doctor-panel')).toHaveLength(1);
});

test('a dismissed macOS notification request remains optional', async () => {
  const status = {
    authorization: 'not-determined' as const,
    alertsEnabled: false,
    soundsEnabled: false,
  };
  let requests = 0;
  const { bridge } = fakeBridge({ 'notifications list': () => envelope([]) });
  const byTestId = await renderWithMesa(
    <App startOnBoard />,
    bridge,
    fakePlatform({
      notifications: {
        status: async () => status,
        requestPermission: async () => {
          requests++;
          throw new Error('notification permission was not granted');
        },
        send: async () => {},
        onOpen: async () => () => {},
        takeOpened: async () => null,
      },
    }),
  );
  await click(byTestId('nav-inbox')[0]);
  expect(requests).toBe(0);
  await click(
    [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Enable notifications',
    ),
  );
  expect(requests).toBe(1);
  expect(byTestId('inbox-panel')[0]?.textContent).toContain(
    'notification permission was not granted',
  );
  expect(byTestId('inbox-panel')[0]?.textContent).toContain('Enable notifications');
});

test('a usage threshold alerts during session work and opens Usage', async () => {
  const zero = {
    events: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    estimatedCostUsd: 0,
  };
  const { bridge } = fakeBridge({
    usage: () =>
      envelope({
        rows: [],
        unknown: [],
        periods: { today: zero, '7d': zero, '30d': zero, '90d': zero, month: zero },
        daily: [],
        breakdown: [],
        alerts: [{ period: 'today', thresholdUsd: 1, knownCostUsd: 1.5 }],
      }),
    rewind: () =>
      envelope({
        from: '2026-09-22',
        through: '2026-09-29',
        timezone: 'UTC',
        notes: [],
        sessions: [],
        usage: zero,
        missing: [],
      }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(toastTexts(byTestId)).toContain(
    'Known estimated today cost reached your $1.00 alert. Agents keep running.',
  );
  await click(byTestId('toast-link')[0]);
  expect(byTestId('usage-panel')).toHaveLength(1);
});

test('the sidebar Vault destination opens the vault inventory', async () => {
  const { bridge } = fakeBridge({
    'vault list': () =>
      envelope({
        vault: '/h/vault',
        total: 1,
        items: [
          {
            path: 'index.md',
            kind: 'markdown',
            category: 'index',
            size: 8,
            modified: '2026-09-24T12:00:00.000Z',
          },
        ],
      }),
  });
  const byTestId = await renderWithMesa(<App startOnBoard />, bridge);
  expect(byTestId('vault-panel')).toEqual([]);
  await click(byTestId('nav-vault')[0]);
  expect(byTestId('nav-vault')[0]?.getAttribute('aria-current')).toBe('page');
  expect(byTestId('vault-panel')[0]?.textContent).toContain('1 item in /h/vault');
  expect(byTestId('vault-file').map((row) => row.dataset.kind)).toEqual(['markdown']);
});
