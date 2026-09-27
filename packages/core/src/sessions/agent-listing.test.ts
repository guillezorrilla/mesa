import { expect, test } from 'vitest';
import { AGENTS } from '../agents/agents.js';
import { codexWorld, listingDeps, SPIKE_LISTING, scriptedRunner } from '../testing/index.js';
import { listAgentProcesses } from './agent-listing.js';

const listing = (...rows: object[]) => JSON.stringify(rows);

test('listAgentProcesses parses claude agents --json with a 2 second timeout', async () => {
  const { run, calls } = scriptedRunner({ claude: listing(SPIKE_LISTING.idle) });
  expect(await listAgentProcesses(listingDeps(run))).toEqual([
    {
      agent: 'claude',
      pid: 67213,
      cwd: '/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj',
      agentSessionId: '36c173f2-803e-4845-bd97-a032b37c6d6d',
      startedAt: '2026-09-24T19:06:04.032Z',
      status: 'idle',
    },
  ]);
  expect(calls).toEqual([{ file: 'claude', args: ['agents', '--json'], timeoutMs: 2000 }]);

  const waiting = scriptedRunner({ claude: listing(SPIKE_LISTING.permission) }).run;
  expect(await listAgentProcesses(listingDeps(waiting))).toMatchObject([
    { status: 'waiting', waitingFor: 'permission prompt' },
  ]);
});

test('listAgentProcesses is [] on a timeout, a failure, or output it cannot read', async () => {
  for (const failure of ['slow', 'missing', 'failing'] as const) {
    const { run } = scriptedRunner(
      { claude: listing(SPIKE_LISTING.idle) },
      { [failure]: ['claude'] },
    );
    expect(await listAgentProcesses(listingDeps(run)), failure).toEqual([]);
  }
  for (const stdout of [
    '',
    'not json',
    '{"pid":1}',
    '[{"pid":"67213"}]',
    '[{"startedAt":1e300}]',
  ]) {
    expect(
      await listAgentProcesses(listingDeps(scriptedRunner({ claude: stdout }).run)),
      stdout,
    ).toEqual([]);
  }
});

test("Claude Code's listing reads each SP-1 status as a session state at 0.85", async () => {
  const run = scriptedRunner({
    claude: listing(
      SPIKE_LISTING.idle,
      SPIKE_LISTING.permission,
      SPIKE_LISTING.question,
      { ...SPIKE_LISTING.idle, status: 'busy' },
      { ...SPIKE_LISTING.idle, status: 'waiting', waitingFor: 'something new' },
      { ...SPIKE_LISTING.idle, status: 'sleeping' },
    ),
  }).run;
  expect((await listAgentProcesses(listingDeps(run))).map(AGENTS.claude.listing.state)).toEqual([
    { state: 'idle', confidence: 0.85 },
    { state: 'waiting-permission', confidence: 0.85 },
    { state: 'waiting-question', confidence: 0.85 },
    { state: 'working', confidence: 0.85 },
    { state: 'waiting-question', confidence: 0.6 },
    { state: 'working', confidence: 0.5 },
  ]);
});

test('Codex sessions list from rollouts written in the last 10 minutes, with no status', async () => {
  const codex = codexWorld();
  const at = (minutesAgo: number) =>
    new Date(Date.parse('2026-09-24T12:00:00.000Z') - minutesAgo * 60_000).toISOString();
  const id = (n: number) => `01a0e14e-0000-7000-8000-00000000000${n}`;
  // Started yesterday, written a minute ago: its folder is its first day's.
  codex.rollout({ id: id(1), cwd: '/src/lantern-cove', startedAt: at(1500), writtenAt: at(1) });
  codex.rollout({ id: id(2), cwd: '/src/tide', startedAt: at(9) });
  codex.rollout({ id: id(3), cwd: '/src/tide', startedAt: at(11) });
  codex.rollout({ id: id(4), cwd: '/src/tide', startedAt: at(2), originator: 'codex_exec' });
  const listed = await listAgentProcesses(listingDeps(scriptedRunner().run, { env: codex.env }));
  expect(listed.sort((a, b) => a.agentSessionId.localeCompare(b.agentSessionId))).toEqual([
    { agent: 'codex', cwd: '/src/lantern-cove', agentSessionId: id(1), startedAt: at(1500) },
    { agent: 'codex', cwd: '/src/tide', agentSessionId: id(2), startedAt: at(9) },
  ]);
  // A rollout says nothing of what its session does now, or whether it still runs.
  expect(listed.map(AGENTS.codex.listing.state)).toEqual([undefined, undefined]);
});
