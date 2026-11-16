import { MesaError } from '../../lib/result.js';
import type { SessionStore } from '../record/store.js';
import { askHost, hostSocket } from './socket.js';

/**
 * Stops session `id`'s agent mid-turn through its host (ADR-0029), as Esc does in its terminal:
 * Claude's `interrupt` control request, Codex's `turn/interrupt`. Refused as usage for a session
 * not in Structured view; agent_unavailable when no host answers.
 */
export async function interruptSession(deps: { store: SessionStore; hosts: string }, id: string) {
  const record = deps.store.get(id);
  if (record.view !== 'structured')
    throw new MesaError(
      'usage',
      `session ${id} is not in Structured view; in its terminal, Esc interrupts the agent`,
    );
  const reply = await askHost(hostSocket(deps.hosts, id), { type: 'interrupt' });
  if (!reply) throw new MesaError('agent_unavailable', `session ${id}: its host does not answer`);
  if (!reply.ok) throw new MesaError('agent_unavailable', `session ${id}: ${reply.error}`);
  return { session: id, interrupted: true as const };
}
