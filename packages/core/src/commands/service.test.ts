import { describe, expect, it } from 'vitest';
import { agentWorld, hostedSession, projectProfile, shortTempDir } from '../testing/index.js';

describe('the slash commands a session offers', () => {
  it("are a Structured Claude Code session's init commands, described from the catalog", async () => {
    // RECORDED_CLAUDE_STREAM's init names compact, context and lanternecho.
    const w = await hostedSession();
    const commands = w.mesa.commands(w.record.id);
    expect(commands.map((c) => c.name)).toEqual(['compact', 'context', 'lanternecho']);
    expect(commands[0]?.description).not.toBe('');
    expect(commands[2]).toEqual({ name: 'lanternecho', description: '', source: 'builtin' });
    w.host.stop();
    await w.host.done;
  });

  it('are the scanned catalog for a Terminal session', async () => {
    const agents = agentWorld();
    const { mesa } = projectProfile(agents.run, { home: shortTempDir() });
    const { result } = await mesa.sessions.open('lantern-cove');
    expect(mesa.commands(result.id).map((c) => c.name)).toContain('compact');
    expect(mesa.commands(result.id).map((c) => c.name)).not.toContain('lanternecho');
  });
});
