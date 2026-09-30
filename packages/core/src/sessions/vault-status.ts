import { vaultMountStatus } from '../agents/antigravity/vault-mount.js';
import { toFail } from '../lib/result.js';
import type { InstructionStatus } from './instructions.js';
import type { SessionRecord } from './record.js';

/**
 * Whether a session's agent has mesa-vault mounted, in the instruction hook's states: Claude
 * Code and Codex carry the mount in every launch command Mesa builds (agents/vault-mount.ts);
 * Antigravity reads Mesa's one global entry and allow rule. Configuration, not proof that the
 * server answered.
 */
export function vaultStatus(
  agent: SessionRecord['agent'],
  home: string,
  self: readonly string[],
): InstructionStatus {
  if (agent === 'terminal')
    return { state: 'unsupported', reason: 'A plain terminal runs no agent' };
  if (agent !== 'antigravity')
    return { state: 'configured', reason: 'mesa-vault is mounted in its launch command' };
  try {
    const mount = vaultMountStatus(home, self);
    if (mount.stale)
      return {
        state: 'conflicting',
        reason: 'Mesa mesa-vault entry is stale; run mesa hooks install',
      };
    if (!mount.server) return { state: 'missing', reason: 'Run mesa hooks install' };
    if (!mount.rule)
      return {
        state: 'missing',
        reason: 'mesa-vault allow rule is missing; run mesa hooks install',
      };
    return { state: 'configured', reason: 'Global mesa-vault entry and allow rule are configured' };
  } catch (error) {
    return { state: 'conflicting', reason: toFail(error).error.message };
  }
}
