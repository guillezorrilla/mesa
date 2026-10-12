// @vitest-environment happy-dom
import type { Ticket } from '@mesa/core';
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const REPO = 'harbor-co/harbor-api';
const INSTALL = 'https://github.com/apps/mesa-for-tickets/installations/new';
const harborApi = { name: 'harbor-api', describe: 'harbor-co, assigned to me' };

const issue = (number: number, summary: string, extra: Partial<Ticket> = {}): Ticket => ({
  id: `github:${REPO}#${number}`,
  provider: 'github',
  key: `${REPO}#${number}`,
  summary,
  status: 'Open',
  category: 'new',
  assignees: [],
  url: `https://github.com/${REPO}/issues/${number}`,
  mine: false,
  views: ['harbor-api'],
  sessions: [],
  ...extra,
});
const listOf = (tickets: Ticket[]) =>
  envelope({
    project: 'lantern-cove',
    tracker: 'github',
    prompt: null,
    projectPrompt: null,
    defaults: { notes: false, assign: true, start: 'worktree' },
    views: [harborApi],
    tickets,
  });
const shown = (number: number) =>
  envelope({
    id: `github:${REPO}#${number}`,
    provider: 'github',
    key: `${REPO}#${number}`,
    summary: 'Tide chart shows UTC',
    status: 'Open',
    category: 'new',
    assignee: { name: 'mira-keel', accountId: '7002' },
    assignees: [{ name: 'mira-keel', accountId: '7002' }],
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'frontend', color: '0e8a16' },
    ],
    milestone: 'v2.4',
    repository: REPO,
    description: 'Show times in the **harbor** zone.',
    comments: [{ author: 'ash-pier', created: '2026-09-23T10:00:00Z', markdown: 'Seen on 14.' }],
    url: `https://github.com/${REPO}/issues/${number}`,
    mine: false,
    sessions: [],
  });
const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, a, [role="menuitem"]')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
const words = (calls: string[][]) => calls.map((args) => args.slice(1).join(' '));

beforeEach(() => {
  localStorage.clear();
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element).closest?.('a[target="_blank"]')) event.preventDefault();
    },
    true,
  );
});

test('a GitHub project lists issues as Open and Closed, and the panel shows state, assignees, labels, milestone and repo, and adds the person', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      listOf([
        issue(412, 'Tide chart shows UTC', {
          assignee: 'mira-keel',
          assignees: [{ id: '7002', name: 'mira-keel' }],
        }),
        issue(398, 'Upgrade the date library', { status: 'Closed', category: 'done' }),
      ]),
    'tickets show': (args) => shown(Number(String(args.at(-1)).split('#')[1])),
    'tickets assign': () => envelope({ key: `${REPO}#412`, assignee: 'Rowan Tide', receipt: null }),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const groups = [...document.querySelectorAll('[role="listbox"] [aria-expanded]')].map(
    (g) => g.textContent,
  );
  expect(groups).toEqual(['Open1', 'Closed1']);
  expect(byTestId('ticket-row')[0]?.textContent).toBe('#412Tide chart shows UTCM');
  expect(byTestId('view-switcher')[0]?.textContent).toContain(
    'harbor-apiharbor-co, assigned to me',
  );

  const panel = byTestId('ticket-panel')[0];
  expect(words(calls)).toContain(`tickets show -- github:${REPO}#412`);
  // The tracker icon sits by the id; then GitHub's own rows.
  expect(panel?.querySelector('svg + .font-mono')?.textContent).toBe('#412');
  expect(panel?.textContent).toContain('#412Open in GitHub');
  expect(panel?.textContent).toContain(
    `StateOpenAssigneesMmira-keelAssign to meLabelsbugfrontendMilestonev2.4Repository${REPO}`,
  );
  expect(panel?.textContent).toContain('Show times in the harbor zone.');
  expect(panel?.textContent).toContain('Seen on 14.');
  await click(button('Assign to me'));
  expect(words(calls)).toContain(`tickets assign -- github:${REPO}#412`);
  // Starting adds the person beside the assignee, on a branch named after the issue.
  expect(byTestId('start-summary')[0]?.textContent).toBe(
    'Runs in a new worktree on issue-412 · assign to me',
  );
});

test("Follow a repo picks this project's remote, narrows by label and milestone with a live count, and gives Mesa access to a new repo", async () => {
  let repos = [REPO, 'harbor-co/tide-feed'];
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([]),
    prompts: () => envelope([]),
    'tickets views': () =>
      envelope([{ ...harborApi, provider: 'github', repo: REPO, following: ['lantern-cove'] }]),
    'tickets repos': () =>
      envelope({
        repos: repos.map((fullName) => ({
          fullName,
          private: true,
          url: '',
          origin: fullName === REPO,
        })),
        install: INSTALL,
      }),
    'tickets repo': () =>
      envelope({
        repo: REPO,
        labels: [
          { name: 'bug', color: 'd73a4a' },
          { name: 'docs', color: 'cccccc' },
        ],
        milestones: [{ number: 3, title: 'v2.4' }],
      }),
    'tickets preview': () =>
      envelope({
        describe: 'x',
        jql: `GET /repos/${REPO}/issues?state=open&assignee=rowan-tide&labels=bug&milestone=3`,
        count: 2,
        more: false,
      }),
    'tickets views add': () => envelope({ name: 'berth-planner', describe: 'x' }),
    'tickets follow': () => envelope({ project: 'lantern-cove', following: ['berth-planner'] }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('No issues in this repo.');
  await click(byTestId('view-switcher')[0]);
  await click(button('Follow a repo'));
  const dialog = () => byTestId('follow-view-dialog')[0]?.textContent ?? '';
  expect(dialog()).toContain(
    'Follow a repoIts issues show up in this tab. Pull requests are left out.',
  );
  expect(byTestId('repo-button')[0]?.textContent).toBe(`${REPO}This project's remote`);
  // The filters start empty: Any label, Any milestone, each picked from a searchable list.
  const item = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((i) => i.textContent === name);
  expect(byTestId('labels-button')[0]?.textContent).toBe('Any label');
  expect(byTestId('milestone-button')[0]?.textContent).toBe('Any milestone');
  await click(byTestId('labels-button')[0]);
  expect(document.querySelector('[cmdk-input]')?.getAttribute('placeholder')).toBe(
    'Search 2 labels',
  );
  await click(item('bug'));
  // Several labels can be ticked in a row: the list stays open, the picked one checked.
  expect(item('bug')?.getAttribute('aria-checked')).toBe('true');
  expect(
    byTestId('repo-filters')[0]?.querySelector('[aria-label="Remove label bug"]'),
  ).toBeTruthy();
  await click(item('docs'));
  expect(dialog()).toContain('Issues must have every label picked.');
  await click(button('Remove label docs'));
  expect(byTestId('labels-button')[0]?.textContent).toBe('Add label');
  await click(byTestId('milestone-button')[0]);
  await click(item('v2.4'));
  expect(byTestId('milestone-button')[0]?.textContent).toBe('v2.4');
  expect(words(calls)).toContain(
    `tickets preview --provider github --repo ${REPO} --label=bug --milestone 3`,
  );
  expect(dialog()).toContain(
    '2 issues right now, pull requests left out, shown as "harbor-api 2".',
  );
  expect(dialog()).toContain('Advanced: the request Mesa sends');
  expect(dialog()).toContain('Only issues assigned to me');
  expect(dialog()).toContain('Hide closed issues');

  // A repo made after connecting: Give Mesa access on GitHub, then back in the window it is picked.
  expect(dialog()).toContain('Mesa can read 2 of your repos.');
  const give = button('Made a new repo? Give Mesa access on GitHub') as HTMLAnchorElement;
  expect(give.getAttribute('href')).toBe(INSTALL);
  await click(give);
  expect(dialog()).toContain(
    'Finish on GitHub: tick the repos Mesa may read, then come back here.',
  );
  repos = [...repos, 'harbor-co/berth-planner'];
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(dialog()).toContain("Mesa can now read harbor-co/berth-planner; it's picked above.");
  expect(byTestId('repo-button')[0]?.textContent).toBe('harbor-co/berth-plannerJust added');
  await click(byTestId('confirm-follow-view')[0]);
  expect(
    words(calls).filter((w) => w.startsWith('tickets views add') || w.startsWith('tickets follow')),
  ).toEqual([
    'tickets views add --provider github --repo harbor-co/berth-planner -- berth-planner',
    'tickets follow -- lantern-cove berth-planner',
  ]);
});
