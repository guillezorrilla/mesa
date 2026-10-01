// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { cells, click, envelope, fakeBridge, PROJECTS, renderWithMesa } from '@/lib/testing';
import { ProjectsScreen } from '@/screens/ProjectsScreen';

test('the Projects screen lists the fixture projects, marking one whose path is gone', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  const byTestId = await renderWithMesa(<ProjectsScreen onAddProject={() => {}} />, bridge);

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
  const byTestId = await renderWithMesa(<ProjectsScreen onAddProject={() => {}} />, bridge);
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
  const byTestId = await renderWithMesa(<ProjectsScreen onAddProject={() => {}} />, bridge);
  expect(calls).toContainEqual(['--json', 'skills', 'list', '--', 'lantern-cove']);
  // Only the linked Mesa skills: not one only enabled, not the project's own.
  expect(byTestId('synced-skills').map((c) => c.textContent)).toEqual(['mesa']);
});

test('Open session starts a session for the row and says so', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    open: () => envelope({ id: 'a1b2c3d4', project: 'lantern-cove' }),
  });
  const byTestId = await renderWithMesa(<ProjectsScreen onAddProject={() => {}} />, bridge);
  await click(byTestId('open-session')[0]);
  expect(calls).toContainEqual(['--json', 'open', '--no-parent', '--', 'lantern-cove']);
  expect(byTestId('toast')[0]?.textContent).toContain('Opened session a1b2c3d4 on lantern-cove');
});

test('repository link checkout validates before calling mesa and refreshes Projects', async () => {
  let registered = false;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(registered ? PROJECTS.slice(0, 1) : []),
    'projects clone': () => {
      registered = true;
      return envelope({ name: 'lantern-cove', path: '/src/lantern-cove', created: true });
    },
  });
  const byTestId = await renderWithMesa(
    <ProjectsScreen onAddProject={() => {}} cloneLink={{ url: '', request: 1 }} />,
    bridge,
  );
  const input = byTestId('repository-url')[0] as HTMLInputElement;
  const type = async (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await type('file:///tmp/repo');
  expect(byTestId('clone-project')[0]?.hasAttribute('disabled')).toBe(true);
  const link = 'mesa://clone?url=https%3A%2F%2Fexample.com%2Fteam%2Flantern-cove.git';
  await type(link);
  await click(byTestId('clone-project')[0]);
  expect(calls).toContainEqual(['--json', 'projects', 'clone', '--', link]);
  expect(byTestId('project-row')).toHaveLength(1);
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
  const byTestId = await renderWithMesa(<ProjectsScreen onAddProject={() => {}} />, bridge);
  await click(byTestId('view-sessions')[0]);
  expect(calls).toContainEqual(['--json', 'view', '--app', '--', 'lantern-cove']);
  expect(byTestId('toast')[0]?.textContent).toBe('Viewing 2 sessions of lantern-cove in Terminal');
});
