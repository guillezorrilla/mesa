import type { SessionRecord } from '../record/record.js';
import type { InstructionStatus } from './instructions.js';

/**
 * Whether a session's agent reaches the vault, in the instruction hook's states: every agent
 * session does, through the mesa CLI the mesa-vault skill teaches (ADR-0031), which its window
 * has on PATH; a plain terminal runs no agent.
 */
export function vaultStatus(record: Pick<SessionRecord, 'agent'>): InstructionStatus {
  return record.agent === 'terminal'
    ? { state: 'unsupported', reason: 'A plain terminal runs no agent' }
    : { state: 'configured', reason: 'The mesa vault commands, through the mesa-vault skill' };
}
