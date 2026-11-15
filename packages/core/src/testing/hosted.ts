import { agentWorld } from './agents.js';
import { RECORDED_CLAUDE_STREAM, replaySpawner } from './claude-stream.js';
import { projectProfile } from './profile.js';
import { shortTempDir } from './tmp.js';

/**
 * A Structured session on lantern-cove with its host running in this process, claude's process a
 * fake that replays `stream` and stays up: the profile, the fake, the record and the host.
 */
export async function hostedSession(stream = RECORDED_CLAUDE_STREAM) {
  const fake = replaySpawner(stream, { stay: true });
  const agents = agentWorld();
  const { home, mesa } = projectProfile(agents.run, { home: shortTempDir(), spawn: fake.spawn });
  const { result: record } = await mesa.sessions.open('lantern-cove', {
    view: 'structured',
    goal: 'make a file',
  });
  const host = await mesa.sessions.host(record.id, () => undefined);
  return { home, mesa, fake, record, host, agents };
}
