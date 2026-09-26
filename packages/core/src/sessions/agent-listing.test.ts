import { expect, test } from 'vitest';
import { SPIKE_LISTING, scriptedRunner } from '../testing/index.js';
import { listAgentProcesses, listedState } from './agent-listing.js';

const listing = (...rows: object[]) => JSON.stringify(rows);

test('listAgentProcesses parses claude agents --json with a 2 second timeout', async () => {
  const { run, calls } = scriptedRunner({ claude: listing(SPIKE_LISTING.idle) });
  expect(await listAgentProcesses(run)).toEqual([
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
  expect(await listAgentProcesses(waiting)).toMatchObject([
    { status: 'waiting', waitingFor: 'permission prompt' },
  ]);
});

test('listAgentProcesses is [] on a timeout, a failure, or output it cannot read', async () => {
  for (const failure of ['slow', 'missing', 'failing'] as const) {
    const { run } = scriptedRunner(
      { claude: listing(SPIKE_LISTING.idle) },
      { [failure]: ['claude'] },
    );
    expect(await listAgentProcesses(run), failure).toEqual([]);
  }
  for (const stdout of [
    '',
    'not json',
    '{"pid":1}',
    '[{"pid":"67213"}]',
    '[{"startedAt":1e300}]',
  ]) {
    expect(await listAgentProcesses(scriptedRunner({ claude: stdout }).run), stdout).toEqual([]);
  }
});

test('listedState reads each SP-1 status as a session state at 0.85', async () => {
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
  expect((await listAgentProcesses(run)).map(listedState)).toEqual([
    { state: 'idle', confidence: 0.85 },
    { state: 'waiting-permission', confidence: 0.85 },
    { state: 'waiting-question', confidence: 0.85 },
    { state: 'working', confidence: 0.85 },
    { state: 'waiting-question', confidence: 0.6 },
    { state: 'working', confidence: 0.5 },
  ]);
});
