// @vitest-environment happy-dom
import type { FollowedView, Ticket } from '@mesa/core';
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { choose, click, envelope, failure, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const ticket = (key: string, summary: string, extra: Partial<Ticket> = {}): Ticket => ({
  id: `jira:${key}`,
  provider: 'jira',
  key,
  summary,
  status: 'To Do',
  category: 'new',
  url: `https://lantern-cove.atlassian.net/browse/${key}`,
  site: 'cloud-1',
  mine: false,
  views: ['sprint'],
  sessions: [],
  ...extra,
});
const sprint: FollowedView = {
  name: 'sprint',
  describe: 'Current sprint of board Tide team (only mine, not done)',
  sprints: ['Tide 7'],
};
const listOf = (views: FollowedView[], tickets: Ticket[]) =>
  envelope({
    project: 'lantern-cove',
    tracker: 'jira',
    prompt: 'Ticket flow',
    projectPrompt: null,
    defaults: { notes: false, assign: true, start: 'worktree' },
    views,
    tickets,
  });
const shown = (key: string, extra: object = {}) =>
  envelope({
    key,
    summary: 'Show the next high tide',
    labels: ['frontend'],
    description: 'Harbor staff ask for **the next high tide**.',
    comments: [
      {
        author: 'Ash Pier',
        created: '2026-09-23T10:00:00.000Z',
        markdown: 'Use the wind card style.',
      },
    ],
    url: `https://lantern-cove.atlassian.net/browse/${key}`,
    site: 'cloud-1',
    mine: false,
    sessions: [],
    ...extra,
  });
/** Types into a field as a person does: the input event React's onChange reads. */
const fill = (field: HTMLInputElement | HTMLTextAreaElement | null, text: string) =>
  act(async () => {
    if (!field) return;
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
const atlassian = (status: 'connected' | 'needs-reconnect' | 'disconnected') => ({
  id: 'atlassian',
  label: 'Atlassian',
  connected: status !== 'disconnected',
  status,
});
const words = (calls: string[][]) => calls.map((args) => args.slice(1).join(' '));

// Each test starts with no view or ticket kept from another.
beforeEach(() => localStorage.clear());

test('the list groups tickets by status name, Ready apart from In Progress, and the panel shows the ticket whole and assigns it', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      listOf(
        [sprint],
        [
          // Ready listed first by Jira, still grouped after In Progress: groups go by name.
          ticket('LC-3', 'Chart the spring tides', { category: 'indeterminate', status: 'Ready' }),
          ticket('LC-1', 'Retry the tide feed', {
            category: 'indeterminate',
            status: 'In Progress',
            assignee: 'Mira Keel',
            sessions: [{ id: 'aaaaaaaa', project: 'harbor-gate' }],
          }),
          ticket('LC-2', 'Show the next high tide'),
        ],
      ),
    'tickets show': (args) => shown(String(args.at(-1))),
    'tickets assign': () => envelope({ key: 'LC-2', assignee: 'Rowan Tide', receipt: null }),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const groups = [...document.querySelectorAll('[role="listbox"] [aria-expanded]')].map(
    (g) => g.textContent,
  );
  expect(groups).toEqual(['In Progress1', 'Ready1', 'To Do1']);
  expect(byTestId('ticket-row')[0]?.textContent).toContain('LC-1Retry the tide feedLive');
  expect(byTestId('view-switcher')[0]?.textContent).toContain('sprintTide 7');

  await click(byTestId('ticket-row')[2]);
  const panel = () => byTestId('ticket-panel')[0]?.textContent ?? '';
  expect(panel()).toContain('Show the next high tide');
  expect(panel()).toContain('Harbor staff ask for the next high tide.');
  expect(panel()).toContain('Use the wind card style.');
  expect(panel()).toContain('SprintTide 7');
  await click(button('Assign to me'));
  expect(words(calls)).toContain('tickets assign -- jira:LC-2');
});

/** A Tickets tab over one ticket, LC-2, whose start runs every step. */
async function startable(answers: Record<string, (args: string[]) => unknown> = {}) {
  const opened: string[] = [];
  const fake = fakeBridge({
    tickets: () => listOf([sprint], [ticket('LC-2', 'Show the next high tide')]),
    'tickets show': (args) => shown(String(args.at(-1))),
    'tickets assign': () => envelope({ key: 'LC-2', assignee: 'Rowan Tide', receipt: null }),
    prompts: () =>
      envelope([
        { name: 'Ticket flow', text: '/goal Deliver the ticket below.' },
        { name: 'Hotfix flow', text: '/goal Fix it fast.' },
      ]),
    import: () => envelope({ project: 'lantern-cove', items: [], receipt: null }),
    'import goal': () =>
      envelope({
        source: 'jira',
        id: 'LC-2',
        title: 'LC-2: Show',
        goal: '/goal Fix it fast.\n\nWork on LC-2',
      }),
    open: () => envelope({ id: 'bbbbbbbb', project: 'lantern-cove', receipt: null }),
    ...answers,
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={(id) => opened.push(id)} />,
    fake.bridge,
  );
  const started = () => words(fake.calls).filter((w) => /^(tickets assign|import|open)/.test(w));
  return { ...fake, byTestId, opened, started };
}

test('Start goal starts at once with the project defaults, then opens the session on its own', async () => {
  const { byTestId, opened, started } = await startable();
  expect(byTestId('start-summary')[0]?.textContent).toBe(
    'Runs in a new worktree on lc-2 · assign to me · your rules: Ticket flow',
  );
  await click(byTestId('start-goal')[0]);
  expect(started()).toEqual([
    'tickets assign -- jira:LC-2',
    'import --project lantern-cove --no-notes -- https://lantern-cove.atlassian.net/browse/LC-2',
    'import goal --project lantern-cove --prompt=Ticket flow --as=goal -- LC-2',
    'open --from=LC-2 --exact-goal --no-parent --goal=/goal Fix it fast.\n\nWork on LC-2 --branch=lc-2 -- lantern-cove',
  ]);
  expect(byTestId('start-progress')[0]?.textContent).toContain(
    'Start the goal in a new worktree on lc-2',
  );
  // The session opens on its own once every step is done, and only once.
  expect(opened).toEqual(['bbbbbbbb']);
  await click(button('Open session'));
  expect(opened).toEqual(['bbbbbbbb', 'bbbbbbbb']);
});

test('a start whose step fails opens nothing and offers Back', async () => {
  const { byTestId, opened } = await startable({
    open: () => failure('tmux is not running', 'internal'),
  });
  await click(byTestId('start-goal')[0]);
  expect(byTestId('start-progress')[0]?.textContent).toContain('Back');
  expect(opened).toEqual([]);
});

test('Start session and Investigate each build their own goal', async () => {
  for (const as of ['session', 'investigate']) {
    const { byTestId, started } = await startable();
    await click(byTestId(`start-${as}`)[0]);
    expect(started()).toContain(
      `import goal --project lantern-cove --prompt=Ticket flow --as=${as} -- LC-2`,
    );
  }
});

test('Options changes the start first, and keeps each change as the project default for every ticket', async () => {
  const saved = [{ name: 'Ticket flow', text: '/goal Deliver the ticket below.' }];
  const { byTestId, calls, started } = await startable({
    'tickets defaults': () => envelope({ notes: false, assign: true, start: 'checkout' }),
    'tickets prompt': () => envelope({ project: 'lantern-cove', prompt: 'Tidy flow' }),
    prompts: () => envelope(saved),
    'prompts save': (args) => {
      saved.push({ name: String(args.at(-2)), text: String(args.at(-1)) });
      return envelope(saved.at(-1));
    },
  });
  await click(byTestId('start-options')[0]);
  const sheet = () => byTestId('start-sheet')[0]?.textContent ?? '';
  expect(sheet()).toContain('Assign LC-2 to me');
  expect(sheet()).toContain('Its own checkout, on the branch lc-2');
  await click(button('Main checkout'));
  expect(sheet()).toContain("The project's own checkout");
  expect(words(calls)).toContain('tickets defaults --start checkout -- lantern-cove');

  // New prompt writes one here, saves it, and picks it.
  const prompt = () => document.getElementById('start-prompt') as HTMLSelectElement;
  await choose(prompt(), ' new');
  const form = byTestId('new-prompt-form')[0] as HTMLElement;
  await fill(form.querySelector<HTMLInputElement>('[aria-label="Prompt name"]'), 'Tidy flow');
  await fill(
    form.querySelector<HTMLTextAreaElement>('[aria-label="Prompt text"]'),
    'Small commits.',
  );
  await click(button('Save prompt'));
  expect(words(calls)).toContain('prompts save -- Tidy flow Small commits.');
  expect(byTestId('new-prompt-form')).toHaveLength(0);
  expect(prompt().value).toBe('Tidy flow');
  expect(words(calls)).toContain('tickets prompt --project lantern-cove -- Tidy flow');

  // The preview shows each start's own prompt, with your rules after it.
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
      (b) => b.textContent === 'Investigate',
    ),
  );
  expect(byTestId('start-preview')[0]?.textContent).toMatch(
    /^Investigate LC-2[\s\S]*My rules:\nSmall commits\.$/,
  );
  await click(byTestId('start-investigate').at(-1));
  expect(started()).toContain(
    'import goal --project lantern-cove --prompt=Tidy flow --as=investigate -- LC-2',
  );
  expect(started().at(-1)).toBe(
    'open --from=LC-2 --exact-goal --no-parent --goal=/goal Fix it fast.\n\nWork on LC-2 -- lantern-cove',
  );
});

test('Follow picks a board, counts its tickets live, then adds the view under the name typed and follows it', async () => {
  let followed = false;
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf(followed ? [sprint] : [], []),
    prompts: () => envelope([]),
    'tickets views': () =>
      envelope([{ ...sprint, site: 'cloud-1', board: 42, following: ['harbor-gate'] }]),
    'tickets boards': () =>
      envelope({
        site: { id: 'cloud-1', name: 'lantern-cove' },
        boards: [
          { id: 41, name: 'Harbor team', type: 'scrum' },
          { id: 42, name: 'Tide team', type: 'scrum', project: 'LC' },
        ],
      }),
    'tickets preview': () =>
      envelope({ describe: 'x', jql: '(sprint = 7) ORDER BY Rank ASC', count: 3, more: false }),
    'sources list': () => envelope({ sources: [atlassian('connected')] }),
    'tickets views add': () => envelope({ name: 'Tide work', describe: 'x' }),
    'tickets follow': () => {
      followed = true;
      return envelope({ project: 'lantern-cove', following: ['Tide work'] });
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Pick the Jira tickets to show here');
  await click(button('Follow a Jira view'));
  const dialog = () => byTestId('follow-view-dialog')[0]?.textContent ?? '';
  // The board view another project follows can be followed in one click.
  expect(dialog()).toContain('Views you already have');
  await click(document.getElementById('view-pick-42') ?? undefined);
  expect(dialog()).toContain('3 tickets right now, shown as "Tide team sprint"');
  // The name is optional: empty, the view is named after what it reads; one taken is refused.
  await fill(document.querySelector<HTMLInputElement>('#view-name'), 'SPRINT');
  expect(dialog()).toContain('You already have a view named sprint.');
  expect(byTestId('confirm-follow-view')[0]?.hasAttribute('disabled')).toBe(true);
  await fill(document.querySelector<HTMLInputElement>('#view-name'), 'Tide work');
  expect(dialog()).toContain('shown as "Tide work"');
  await click(byTestId('confirm-follow-view')[0]);
  expect(
    words(calls).filter((w) => w.startsWith('tickets views add') || w.startsWith('tickets follow')),
  ).toEqual([
    'tickets views add --board 42 --sprint current -- Tide work',
    'tickets follow -- lantern-cove Tide work',
  ]);
  expect(byTestId('follow-view-dialog')).toHaveLength(0);
});

test('a board list the sign-in lacks scopes for offers Reconnect, which signs in and lists them', async () => {
  let scoped = false;
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([], []),
    prompts: () => envelope([]),
    'tickets views': () => envelope([]),
    'tickets boards': () =>
      scoped
        ? envelope({
            site: { id: 'cloud-1', name: 'lantern-cove' },
            boards: [{ id: 42, name: 'Tide team', type: 'scrum' }],
          })
        : {
            ok: false,
            error: {
              code: 'invalid_config',
              message:
                'Atlassian needs reconnecting to allow this: run mesa sources connect atlassian',
              details: { connect: 'atlassian' },
            },
          },
    'tickets preview': () =>
      envelope({ describe: 'x', jql: '(sprint = 7) ORDER BY Rank ASC', count: 3, more: false }),
    'sources list': () => envelope({ sources: [atlassian('connected')] }),
    'sources connect': () => {
      scoped = true;
      return envelope(atlassian('connected'));
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(button('Follow a Jira view'));
  expect(byTestId('source-error')[0]?.textContent).toContain('Atlassian needs reconnecting');
  await click(button('Reconnect'));
  expect(words(calls)).toContain('sources connect atlassian');
  expect(byTestId('source-error')).toHaveLength(0);
  expect(document.getElementById('view-pick-42')).not.toBeNull();
});

test('with no view and Jira not connected, the tab names Jira and signs in with Atlassian first', async () => {
  let status: 'connected' | 'disconnected' = 'disconnected';
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([], []),
    'sources list': () => envelope({ sources: [atlassian(status)] }),
    'sources connect': () => {
      status = 'connected';
      return envelope(atlassian(status));
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Bring your Jira sprint into Mesa');
  expect(button('Follow a Jira view')).toBeUndefined();
  await click(button('Connect Jira'));
  expect(words(calls)).toContain('sources connect atlassian');
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Signed in with Atlassian');
  expect(button('Follow a Jira view')).toBeDefined();
});

test('with no view and an expired Atlassian sign-in, the tab offers Reconnect Jira', async () => {
  const { bridge } = fakeBridge({
    tickets: () => listOf([], []),
    'sources list': () => envelope({ sources: [atlassian('needs-reconnect')] }),
  });
  await renderWithMesa(<TicketsTab project="lantern-cove" onSession={() => {}} />, bridge);
  expect(button('Reconnect Jira')).toBeDefined();
  expect(button('Follow a Jira view')).toBeUndefined();
});

test('a view that needs a fresh sign-in says so and offers Reconnect', async () => {
  const { bridge } = fakeBridge({
    tickets: () =>
      listOf(
        [{ name: 'boards', describe: 'x', error: 'needs reconnecting', connect: 'atlassian' }],
        [],
      ),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain(
    'Mesa needs a fresh sign-in to read boards from Jira.',
  );
  expect(button('Reconnect Atlassian')).toBeDefined();
});

test('the view picked stays picked when the person leaves the project and comes back', async () => {
  const harbor: FollowedView = {
    name: 'harbor',
    describe: 'JQL: project = HB (everyone, not done)',
  };
  const { bridge } = fakeBridge({
    tickets: () =>
      listOf(
        [sprint, harbor],
        [
          ticket('LC-1', 'Retry the tide feed'),
          ticket('HB-2', 'Paint the harbor gate', { views: ['harbor'] }),
        ],
      ),
    'tickets show': (args) => shown(String(args.at(-1))),
    prompts: () => envelope([]),
  });
  const rows = () => byTestId('ticket-row').map((r) => r.textContent ?? '');
  let byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(rows()).toHaveLength(2);
  await click(byTestId('view-switcher')[0]);
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((item) =>
      item.textContent?.startsWith('harbor'),
    ),
  );
  expect(rows()).toEqual([expect.stringContaining('HB-2')]);

  // Another visit to the project, the tab mounted again: still the harbor view.
  byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(rows()).toEqual([expect.stringContaining('HB-2')]);
});

test('the ticket picked stays picked when the person leaves the tab and comes back', async () => {
  const { bridge } = fakeBridge({
    tickets: () =>
      listOf(
        [sprint],
        [ticket('LC-1', 'Retry the tide feed'), ticket('LC-2', 'Show the next high tide')],
      ),
    'tickets show': (args) => shown(String(args.at(-1))),
    prompts: () => envelope([]),
  });
  const panel = () => byTestId('ticket-panel')[0]?.textContent ?? '';
  let byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(panel()).toContain('LC-1');
  await click(byTestId('ticket-row').find((row) => row.textContent?.includes('LC-2')));
  expect(panel()).toContain('LC-2');

  // Another visit to the tab, mounted again: still LC-2, not the first ticket.
  byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(panel()).toContain('LC-2');
});

test('an option changed on one ticket is where the next ticket starts', async () => {
  let defaults = { notes: false, assign: true, start: 'worktree' };
  const { bridge, calls } = fakeBridge({
    tickets: () => {
      const list = listOf(
        [sprint],
        [ticket('LC-1', 'Retry the tide feed'), ticket('LC-2', 'Show the next high tide')],
      );
      return { ...list, data: { ...(list.data as object), defaults } };
    },
    'tickets defaults': () => {
      defaults = { ...defaults, notes: true };
      return envelope(defaults);
    },
    'tickets show': (args) => shown(String(args.at(-1))),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(byTestId('start-options')[0]);
  await click(document.getElementById('start-notes') ?? undefined);
  expect(words(calls)).toContain('tickets defaults --notes on -- lantern-cove');
  await click(byTestId('ticket-row').find((row) => row.textContent?.includes('LC-2')));
  expect(byTestId('start-summary')[0]?.textContent).toContain('notes first');
});

test('an existing Jira project shows its tab as before: no tracker choice, icon or new control', async () => {
  const { bridge } = fakeBridge({
    tickets: () => listOf([sprint], [ticket('LC-2', 'Show the next high tide')]),
    'tickets show': (args) => shown(String(args.at(-1))),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const tab = byTestId('tickets-tab')[0];
  const labels = [...(tab?.querySelectorAll('button') ?? [])].map(
    (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
  );
  // Today's controls, in order: the view switcher, Refresh, the gear, the group, the row, then
  // the panel's back, Assign to me, and the starts.
  expect(labels).toEqual([
    'sprintTide 7',
    'Refresh tickets',
    'Ticket settings',
    'To Do1',
    'LC-2Show the next high tide?',
    'Tickets',
    'Assign to me',
    'Options',
    'Start session',
    'Investigate',
    'Start goal',
  ]);
  expect(tab?.textContent).not.toMatch(/track work|tracker/i);
  // The panel's id line is the key and Open in Jira, with no tracker icon before the key.
  const panel = byTestId('ticket-panel')[0];
  expect(panel?.textContent).toContain('LC-2Open in Jira');
});

test('with Atlassian not connected, one banner offers Connect for every view', async () => {
  const views = ['sprint', 'bugs'].map((name) => ({
    name,
    describe: 'x',
    error: 'Atlassian is not connected: run mesa sources connect atlassian',
    connect: 'atlassian' as const,
  }));
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      envelope({
        project: 'lantern-cove',
        tracker: 'jira',
        connect: 'atlassian',
        prompt: null,
        projectPrompt: null,
        defaults: { notes: false, assign: true, start: 'worktree' },
        views,
        tickets: [],
      }),
    'sources connect': () => envelope({ result: atlassian('connected'), receipt: null }),
    prompts: () => envelope([]),
  });
  await renderWithMesa(<TicketsTab project="lantern-cove" onSession={() => {}} />, bridge);
  const alerts = [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent);
  expect(alerts).toEqual([
    "Jira isn't connected, so Mesa can't read these views.Connect Atlassian",
  ]);
  await click(button('Connect Atlassian'));
  expect(words(calls)).toContain('sources connect atlassian');
});
