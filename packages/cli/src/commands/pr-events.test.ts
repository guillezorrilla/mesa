import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_VERSION,
  type FakePullRequest,
  fakeGh,
  fakeTmux,
  scriptedRunner,
  testStore,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented pull requests through a scripted gh; the sessions run in a fake tmux, never a real agent.

const cli = cliHarness();
beforeEach(cli.reset);

const PR_URL = 'https://github.com/example/repo/pull/42';
const featurePr = (): FakePullRequest => ({
  number: 42,
  branch: 'feature',
  checks: [
    {
      __typename: 'CheckRun',
      name: 'build',
      workflowName: 'CI',
      conclusion: 'FAILURE',
      completedAt: '2026-09-24T12:05:00Z',
      detailsUrl: 'https://github.com/example/repo/actions/runs/7',
    },
  ],
  reviews: [
    {
      id: 'R1',
      author: { login: 'marlow' },
      state: 'CHANGES_REQUESTED',
      body: 'Rename the tide helper.',
      submittedAt: '2026-09-24T12:10:00Z',
    },
  ],
  comments: [],
  reviewComments: [],
});

/** A fake tmux and gh, and one session open on `feature` in its own worktree; its id and the worlds. */
async function sessionOnBranch() {
  const tmux = fakeTmux();
  const gh = fakeGh([featurePr()]);
  cli.run = scriptedRunner({ tmux: tmux.answer, claude: CLAUDE_VERSION, gh: gh.answer }).run;
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  testStore(cli.home).update(id, {
    worktree: { path: join(cli.home, 'worktrees', 'feature'), branch: 'feature' },
  });
  return { id, tmux, gh };
}

/** One agent hook event in the session's log, as `mesa hook claude` appends it. */
const hook = (id: string, event: string, at: string) => {
  mkdirSync(cli.paths.events, { recursive: true });
  appendFileSync(
    join(cli.paths.events, `${id}.jsonl`),
    `${JSON.stringify({ at, agent: 'claude', event })}\n`,
  );
};
/** The agent finished its turn: a Stop hook, so the board places the session idle. */
const finishTurn = (id: string, at = '2026-09-24T12:00:30.000Z') => hook(id, 'Stop', at);

test('pr-events --json lists pending events per live session on a branch, with gh state', async () => {
  const { id } = await sessionOnBranch();
  const listed = await cli.mesa('pr-events', '--json');
  expect(listed.code, listed.stdout).toBe(0);
  expect(listed.json.data).toMatchObject({
    enabled: false,
    gh: { state: 'ready', version: 'gh version 2.test (2026-09-01)' },
    problems: [],
    events: [
      { session: id, kind: 'check-failed', check: 'CI / build', pr: { number: 42, url: PR_URL } },
      { session: id, kind: 'review', author: 'marlow', state: 'CHANGES_REQUESTED' },
    ],
  });
  // Listing sends nothing and remembers nothing.
  expect((await cli.mesa('pr-events', '--json')).json.data.events).toHaveLength(2);
});

test('pr-events --deliver sends once into an idle session as one prompt with the PR link, with a receipt', async () => {
  const { id, tmux } = await sessionOnBranch();
  const off = await cli.mesa('pr-events', '--deliver', '--json');
  expect(off.code).toBe(2);
  expect(off.json.error.message).toMatch(/sessions\.prEvents/);
  await cli.mesa('config', 'set', 'sessions.prEvents', 'true');
  const typed = () => tmux.windows.find((w) => w.window === `claude-${id}`)?.typed ?? [];

  // Idle by a guess under the threshold, then working: nothing is typed; the events wait.
  const unsure = await cli.mesa('pr-events', '--deliver', '--json');
  expect(unsure.code, unsure.stdout).toBe(0);
  expect(unsure.json.data.deliveries).toEqual([
    expect.objectContaining({ session: id, status: 'waiting', state: 'idle', confidence: 0.6 }),
  ]);
  hook(id, 'UserPromptSubmit', '2026-09-24T12:00:10.000Z');
  const busy = await cli.mesa('pr-events', '--deliver', '--json');
  expect(busy.json.data.deliveries).toEqual([
    expect.objectContaining({ session: id, status: 'waiting', state: 'working' }),
  ]);
  expect(typed()).toEqual([]);

  finishTurn(id);
  const sent = await cli.mesa('pr-events', '--deliver', '--json');
  expect(sent.code, sent.stdout).toBe(0);
  const [delivery] = sent.json.data.deliveries;
  expect(delivery).toMatchObject({
    session: id,
    status: 'delivered',
    state: 'idle',
    events: [`${id}:check-failed:42:CI / build:2026-09-24T12:05:00Z`, `${id}:review:42:R1`],
    receipt: { id: expect.any(String) },
  });
  expect(typed()).toEqual([
    [
      `[mesa] PR #42 (${PR_URL}) on your branch has news:`,
      '- check "CI / build" failed: https://github.com/example/repo/actions/runs/7',
      `- marlow requested changes: "Rename the tide helper." ${PR_URL}`,
    ].join('\n'),
  ]);
  const receipts = (await cli.mesa('receipts', '--session', id, '--kind', 'decision', '--json'))
    .json.data;
  expect(receipts).toHaveLength(1);
  const shown = (await cli.mesa('receipts', 'show', delivery.receipt.id, '--json')).json.data
    .receipt;
  expect(shown).toMatchObject({
    kind: 'decision',
    session: id,
    inputs: { events: delivery.events, pullRequests: [PR_URL] },
    outputs: { state: 'idle', confidence: expect.any(Number) },
  });
  // The board's Faro placement that let it through, with its probabilities.
  expect(shown.decisions[0]).toMatchObject({ kind: 'Choice', answer: 'idle' });
  expect(shown.decisions[0].probabilities.idle).toBeGreaterThan(0.5);

  // Sent once: another pass, idle again, types nothing.
  finishTurn(id, '2026-09-24T12:00:40.000Z');
  const again = await cli.mesa('pr-events', '--deliver', '--json');
  expect(again.json.data.deliveries).toEqual([]);
  expect((await cli.mesa('pr-events', '--json')).json.data.events).toEqual([]);
  expect(typed()).toHaveLength(1);
});

test('gh missing or logged out is reported in --json and the text, not an error', async () => {
  const { gh } = await sessionOnBranch();
  gh.loggedIn = false;
  const loggedOut = await cli.mesa('pr-events', '--json');
  expect(loggedOut.code).toBe(0);
  expect(loggedOut.json.data).toMatchObject({ gh: { state: 'unauthenticated' }, events: [] });
  expect((await cli.mesa('pr-events')).stdout).toMatch(/^gh: not logged in; run gh auth login/);
  const tmux = fakeTmux();
  cli.run = scriptedRunner({ tmux: tmux.answer, claude: CLAUDE_VERSION }, { missing: ['gh'] }).run;
  await cli.mesa('config', 'set', 'sessions.prEvents', 'true');
  const missing = await cli.mesa('pr-events', '--deliver', '--json');
  expect(missing.code).toBe(0);
  expect(missing.json.data).toEqual({ gh: { state: 'missing' }, deliveries: [], problems: [] });
});

test('a send refused before anything is typed gives its events back for the next pass', async () => {
  const { id, tmux } = await sessionOnBranch();
  await cli.mesa('config', 'set', 'sessions.prEvents', 'true');
  finishTurn(id);
  const window = tmux.windows.find((w) => w.window === `claude-${id}`);
  if (!window) throw new Error('no window');
  window.running = 'zsh';
  const refused = await cli.mesa('pr-events', '--deliver', '--json');
  expect(refused.json.data.deliveries).toEqual([
    expect.objectContaining({
      session: id,
      status: 'failed',
      reason: expect.stringMatching(/zsh/),
    }),
  ]);
  expect(window.typed).toEqual([]);
  window.running = '2.1.282';
  const sent = await cli.mesa('pr-events', '--deliver', '--json');
  expect(sent.json.data.deliveries).toEqual([
    expect.objectContaining({ session: id, status: 'delivered' }),
  ]);
  expect(window.typed).toHaveLength(1);
});
