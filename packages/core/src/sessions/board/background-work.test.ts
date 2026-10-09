import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listAgentProcesses } from '../../agents/listing.js';
import {
  fakeTmux,
  fixedClock,
  listingDeps,
  lockDeps,
  newSession,
  SPIKE_LISTING,
  scriptedRunner,
  sequentialIds,
  tempDir,
} from '../../testing/index.js';
import { sessionStore } from '../record/store.js';
import type { HookEvent } from '../signals/hook-events.js';
import { listSessions } from './board.js';

// Claude Code delivers a Monitor event, a background command's end, or a subagent's hand-back as
// a prompt: UserPromptSubmit, then Stop. While that work runs, its listing reads busy, also
// between turns (docs/spikes/state-signals.md).

const hook = (at: string, event: string, more: object = {}): HookEvent => ({
  at: `2026-09-24T${at}.000Z`,
  agent: 'claude',
  event,
  payload: { hook_event_name: event, ...more },
});
const notice = '<task-notification><task-id>b1</task-id></task-notification>';
const running = { background_tasks: [{ id: 'b2', type: 'monitor', status: 'running' }] };

/** The session's state at `now`, after `events`, while the listing reads `status`. */
async function stateAt(now: string, events: HookEvent[], status = 'busy') {
  const store = sessionStore({
    dir: join(tempDir(), 'sessions'),
    newId: sequentialIds(),
    lock: lockDeps(),
  });
  const row = store.create(() =>
    newSession({
      project: 'lantern-cove',
      startedAt: '2026-09-24T11:50:00.000Z',
      tmux: { socket: 'mesa-default', session: 'lantern-cove', window: 'claude-aaaaaa' },
    }),
  );
  store.update(row.id, { agentSessionId: SPIKE_LISTING.idle.sessionId });
  const tmux = fakeTmux();
  tmux.addWindow({ project: 'lantern-cove', window: 'claude-aaaaaa', pid: SPIKE_LISTING.idle.pid });
  const { run } = scriptedRunner({ claude: JSON.stringify([{ ...SPIKE_LISTING.idle, status }]) });
  const [found] = await listSessions({
    store,
    tmux,
    events: () => events,
    listing: () => listAgentProcesses(listingDeps(run)),
    projects: [],
    elsewhere: () => new Set<string>(),
    priorityOf: () => 0.5,
    faro: { decisions: { model: 'none', threshold: 0.7 } },
    env: { CODEX_HOME: tempDir('codex-') },
    home: tempDir(),
    clock: fixedClock(`2026-09-24T${now}.000Z`),
  });
  return found?.lastState;
}

// The reported sequence: two notices, each its own turn, the second running a tool.
const reported = [
  hook('12:00:00', 'UserPromptSubmit', { prompt: notice }),
  hook('12:00:03', 'Stop', running),
  hook('12:01:02', 'UserPromptSubmit', { prompt: notice }),
  hook('12:01:06', 'PostToolUse', { tool_name: 'Bash' }),
  hook('12:01:07', 'UserPromptSubmit', { prompt: notice }),
  hook('12:01:09', 'Stop', running),
];

test('the reported sequence reads idle after its Stop while its monitor keeps the listing busy', async () => {
  expect(await stateAt('12:01:10', reported)).toMatchObject({ state: 'idle', source: 'hook' });
  expect(await stateAt('12:03:00', reported)).toMatchObject({ state: 'idle', source: 'hook' });
});

test('an idle_prompt notification after Stop keeps it idle past a minute', async () => {
  const events = [
    ...reported,
    hook('12:02:09', 'Notification', { notification_type: 'idle_prompt' }),
  ];
  expect(await stateAt('12:02:10', events)).toMatchObject({ state: 'idle', source: 'hook' });
  expect(await stateAt('12:05:00', events)).toMatchObject({ state: 'idle', source: 'hook' });
});

test('a notice that starts a turn reads working until that turn ends', async () => {
  const turn = [...reported, hook('12:05:00', 'UserPromptSubmit', { prompt: notice })];
  expect(await stateAt('12:05:01', turn)).toMatchObject({ state: 'working', source: 'hook' });
  const tool = [...turn, hook('12:05:04', 'PostToolUse', { tool_name: 'Bash' })];
  expect(await stateAt('12:07:00', tool)).toMatchObject({ state: 'working' });
  const ended = [...tool, hook('12:07:30', 'Stop', running)];
  expect(await stateAt('12:09:00', ended)).toMatchObject({ state: 'idle', source: 'hook' });
});

test('a prompt during a running turn keeps it working', async () => {
  const events = [
    hook('12:00:00', 'UserPromptSubmit', { prompt: 'Tidy the harbor notes' }),
    hook('12:00:05', 'PostToolUse', { tool_name: 'Read' }),
    hook('12:00:06', 'UserPromptSubmit', { prompt: notice }),
  ];
  expect(await stateAt('12:00:10', events)).toMatchObject({ state: 'working', source: 'hook' });
});

test('with no background work, a stale Stop still follows the listing and its waits', async () => {
  const stop = [hook('12:00:00', 'Stop')];
  expect(await stateAt('12:03:00', stop, 'idle')).toMatchObject({ state: 'idle' });
  // A missed turn-start hook: a stale working hook yields to an idle listing, as before.
  const prompt = [hook('12:00:00', 'UserPromptSubmit', { prompt: 'Tidy the harbor notes' })];
  expect(await stateAt('12:03:00', prompt, 'idle')).toMatchObject({
    state: 'idle',
    source: 'listing',
  });
  // A background subagent's permission prompt fires no parent hook: the listing's wait wins.
  expect(await stateAt('12:03:00', stop, 'waiting')).toMatchObject({
    state: 'waiting-question',
    source: 'listing',
  });
});
