// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const INSTALL = 'https://github.com/apps/mesa-for-tickets/installations/new';
const REPO = 'harbor-co/harbor-api';
const DEFAULTS = { notes: false, assign: true, start: 'worktree' };

/** The list of a project tracking `tracker`, following `views`, its source connected or not. */
const listOf = (tracker: string | null, views: object[] = [], connect?: string) =>
  envelope({
    project: 'lantern-cove',
    tracker,
    ...(connect ? { connect } : {}),
    prompt: null,
    projectPrompt: null,
    defaults: DEFAULTS,
    views,
    tickets: [],
  });
const source = (id: string, label: string, status: string, account?: object) => ({
  id,
  label,
  connected: status !== 'disconnected',
  status,
  ...(account ? { account } : {}),
});
const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, a')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
const words = (calls: string[][]) => calls.map((args) => args.slice(1).join(' '));
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  // A link that opens the browser stays in the test: its click handlers still run.
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element).closest?.('a[target="_blank"]')) event.preventDefault();
    },
    true,
  );
});

test('a project with no tracker asks where it tracks work: connected first, Connect inline, and GitHub asks to install its app until it reaches a repo', async () => {
  let tracker: string | null = null;
  let github = 'disconnected';
  let repos: string[] = [];
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf(tracker),
    prompts: () => envelope([]),
    'sources list': () =>
      envelope({
        sources: [
          source('atlassian', 'Atlassian', 'connected', {
            name: 'Rowan Tide',
            email: 'rowan@example.test',
          }),
          source(
            'github',
            'GitHub',
            github,
            github === 'connected' ? { name: 'Rowan Tide' } : undefined,
          ),
        ],
      }),
    'sources connect': () => {
      github = 'connected';
      return envelope({ result: source('github', 'GitHub', 'connected'), receipt: null });
    },
    'tickets repos': () =>
      envelope({
        repos: repos.map((fullName) => ({ fullName, private: true, url: '', origin: true })),
        install: INSTALL,
      }),
    'tickets tracker': (args) => {
      tracker = String(args.at(-1));
      return envelope({ project: 'lantern-cove', tracker });
    },
    'tickets views': () => envelope([]),
    'tickets repo': () => envelope({ repo: REPO, labels: [], milestones: [] }),
    'tickets preview': () =>
      envelope({
        describe: 'x',
        jql: `GET /repos/${REPO}/issues?state=open`,
        count: 0,
        more: false,
      }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(text()).toContain('Where does this project track work?');
  const rows = () => byTestId('tracker-choice').map((r) => r.textContent);
  expect(rows()).toEqual([
    'JiraConnected as rowan@example.testUse Jira',
    'GitHub IssuesSign in, then pick the repos Mesa may readConnect',
    'LinearSign in with your Linear workspaceConnect',
  ]);
  expect(text()).toMatch(/Connected.*Not connected yet/);

  // Connect signs in here; reaching no repo, the row sends the person to install the app.
  await click(button('Connect'));
  expect(words(calls)).toContain('sources connect github');
  expect(rows()[1]).toContain("Signed in. Mesa can't see any repositories yet");
  const install = button('Install on GitHub') as HTMLAnchorElement;
  expect(install.getAttribute('href')).toBe(INSTALL);
  await click(install);
  expect(rows()[1]).toContain('Finish on GitHub: pick the repos Mesa may read');

  // Back in the window, the app reaches a repo: Use GitHub sets the tracker and opens Follow.
  repos = [REPO];
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await click(button('Use GitHub'));
  expect(words(calls)).toContain('tickets tracker -- lantern-cove github');
  expect(byTestId('follow-view-dialog')[0]?.textContent).toContain('Follow a repo');
});

test('the gear changes the tracker, says the old views stay and how to go back, and an unconnected tracker shows its page', async () => {
  let tracker = 'jira';
  const sprint = {
    name: 'sprint',
    describe: 'Current sprint of board Tide team',
    sprints: ['Tide 7'],
  };
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      tracker === 'jira'
        ? listOf('jira', [sprint])
        : listOf(
            'github',
            [{ name: 'harbor-api', describe: 'x', connect: 'github', error: 'x' }],
            'github',
          ),
    prompts: () => envelope([]),
    'tickets views': () =>
      envelope([
        { ...sprint, provider: 'jira', following: ['lantern-cove'] },
        {
          name: 'harbor-api',
          provider: 'github',
          repo: REPO,
          describe: 'x',
          following: ['lantern-cove'],
        },
      ]),
    'sources list': () =>
      envelope({
        sources: [
          source('atlassian', 'Atlassian', 'connected'),
          source('github', 'GitHub', 'disconnected'),
        ],
      }),
    'tickets tracker': (args) => {
      tracker = String(args.at(-1));
      return envelope({ project: 'lantern-cove', tracker });
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(button('Ticket settings'));
  expect(byTestId('ticket-settings')[0]?.textContent).toContain(
    'Tracks work in Jira1 followed viewChange',
  );
  await click(button('Change'));
  const dialog = () => byTestId('switch-tracker-dialog')[0]?.textContent ?? '';
  expect(dialog()).toContain('Change where lantern-cove tracks work');
  expect(dialog()).toContain("GitHub IssuesNot connected: you'll sign in next");
  expect(byTestId('switch-note')[0]?.textContent).toBe(
    'Your 1 Jira view stays saved. This tab stops listing them and shows GitHub instead, starting with the 1 GitHub repo you followed before.' +
      'To go back, choose Jira here again: its views return as they were. Sessions already started keep running.',
  );
  await click(byTestId('confirm-switch-tracker')[0]);
  expect(words(calls)).toContain('tickets tracker -- lantern-cove github');
  // GitHub is not connected: its page keeps the followed repo and offers Connect.
  expect(byTestId('tickets-tab')[0]?.textContent).toContain(
    "GitHub isn't connectedThis project tracks work in GitHub. Connect it to see your 1 followed repo here; nothing was lost.Connect GitHubTrack work somewhere else",
  );
});
