// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { App } from '@/App';
import {
  cells,
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  PROJECTS,
  renderWithMesa,
} from '@/lib/testing';

test('the Projects screen lists the fixture projects, marking one whose path is gone', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);

  expect(byTestId('projects-screen')).toHaveLength(1);
  const rows = byTestId('project-row');
  expect(cells(rows[0])).toEqual([
    'lantern-cove',
    '/src/lantern-cove',
    'claude',
    '0.5',
    'none synced',
    'Sync skillsOpen sessionView sessions',
  ]);
  // A project whose path is gone cannot start a session.
  expect(cells(rows[1])).toEqual(['tide ✗', '/src/tide', '', '', '', '']);
  expect(byTestId('project-missing')).toHaveLength(1);
});

test("Sync skills links the project's enabled skills and says what changed", async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'skills list': () =>
      envelope([
        {
          name: 'session-summary',
          source: 'mesa',
          enabled: true,
          description: 'Summarises a session',
        },
      ]),
    'skills sync': () =>
      envelope({
        added: ['.claude/skills/session-summary', '.agents/skills/session-summary'],
        removed: [],
        kept: [],
        conflicts: ['.claude/skills/grill-me'],
        unknown: [],
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);
  // Only a project whose folder exists can take skills.
  expect(byTestId('sync-skills')).toHaveLength(1);
  // The library, with what this profile enables.
  expect(byTestId('skill-row').map((r) => r.textContent)).toEqual([
    'enabledsession-summarySummarises a session',
  ]);
  await click(byTestId('sync-skills')[0]);
  expect(calls).toContainEqual(['--json', 'skills', 'sync', '--', 'lantern-cove']);
  expect(byTestId('toast')[0]?.textContent).toContain(
    "Synced skills into lantern-cove: 2 added, 0 removed; 1 of the project's own left alone",
  );
  // The row's Skills column reads again, so it shows what the sync linked.
  const rowReads = () =>
    calls.filter((c) => c.join(' ') === '--json skills list -- lantern-cove').length;
  const before = rowReads();
  await click(byTestId('sync-skills')[0]);
  expect(rowReads()).toBe(before + 1);
});

test('each project row shows the Mesa skills synced into it', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    'skills list': (argv) =>
      envelope(
        argv.includes('lantern-cove')
          ? [
              { name: 'mesa', source: 'mesa', enabled: true, description: '', linked: true },
              {
                name: 'session-summary',
                source: 'mesa',
                enabled: false,
                description: '',
                linked: false,
              },
              { name: 'grill-me', source: 'repo', enabled: true, description: '' },
            ]
          : [],
      ),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);
  expect(calls).toContainEqual(['--json', 'skills', 'list', '--', 'lantern-cove']);
  // Only the linked Mesa skills: not one only enabled, not the project's own.
  expect(byTestId('synced-skills').map((c) => c.textContent)).toEqual(['mesa']);
});

test('Open session starts a session for the row and says so', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ id: 'a1b2c3d4', project: 'lantern-cove' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);
  await click(byTestId('open-session')[0]);
  expect(calls).toContainEqual(['--json', 'open', '--no-parent', '--', 'lantern-cove']);
  expect(byTestId('toast')[0]?.textContent).toContain('Opened session a1b2c3d4 on lantern-cove');
});

test('Register folder picks a folder, registers it with --create, and refreshes the list', async () => {
  let registered = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(registered ? PROJECTS.slice(0, 1) : []),
    register: () => {
      registered = true;
      return envelope({ name: 'lantern-cove', path: '/src/lantern-cove', created: true });
    },
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({ folder: '/src/lantern-cove' }),
  );
  await click(byTestId('nav-projects')[0]);
  expect(byTestId('project-row')).toHaveLength(0);

  await click(byTestId('register-folder')[0]);
  expect(calls).toContainEqual(['--json', 'register', '--create', '--', '/src/lantern-cove']);
  expect(byTestId('project-row')).toHaveLength(1);
});

test('a cancelled picker registers nothing; a failed register shows in the toast', async () => {
  const cancelled = fakeBridge();
  const quiet = await renderWithMesa(<App />, cancelled.bridge, fakePlatform());
  await click(quiet('nav-projects')[0]);
  await click(quiet('register-folder')[0]);
  expect(cancelled.calls.some((c) => c[1] === 'register')).toBe(false);

  const clash = fakeBridge({ register: () => failure('already registered: tide at /src/tide') });
  const byTestId = await renderWithMesa(
    <App />,
    clash.bridge,
    fakePlatform({ folder: '/src/tide' }),
  );
  await click(byTestId('nav-projects')[0]);
  await click(byTestId('register-folder')[0]);
  expect(byTestId('toast').map((t) => t.querySelector('pre')?.textContent)).toEqual([
    'already registered: tide at /src/tide',
  ]);
});

test("View sessions shows the project's sessions side by side in the terminal app and says so", async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    view: () =>
      envelope({
        opened: true,
        project: 'lantern-cove',
        sessions: ['aaaaaaaa', 'bbbbbbbb'],
        layout: 'tiled',
        app: 'Terminal',
      }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('nav-projects')[0]);
  await click(byTestId('view-sessions')[0]);
  expect(calls).toContainEqual(['--json', 'view', '--app', '--', 'lantern-cove']);
  expect(byTestId('toast')[0]?.textContent).toBe('Viewing 2 sessions of lantern-cove in Terminal');
});
