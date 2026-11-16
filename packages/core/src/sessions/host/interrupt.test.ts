import { describe, expect, it } from 'vitest';
import { hostedSession } from '../../testing/index.js';

describe('interrupting a Structured session', () => {
  it('asks its agent through the host; a Terminal session is told to use Esc', async () => {
    const w = await hostedSession();
    const { result } = await w.mesa.sessions.interrupt(w.record.id);
    expect(result).toEqual({ session: w.record.id, interrupted: true });
    expect(w.fake.sent).toContainEqual(
      expect.objectContaining({ type: 'control_request', request: { subtype: 'interrupt' } }),
    );
    const { result: plain } = await w.mesa.sessions.open('lantern-cove');
    await expect(w.mesa.sessions.interrupt(plain.id)).rejects.toThrow(/Esc interrupts the agent/);
    w.host.stop();
    await w.host.done;
  });
});
