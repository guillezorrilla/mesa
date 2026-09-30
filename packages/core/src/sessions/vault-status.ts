import { vaultMountStatus } from '../agents/antigravity/vault-mount.js';
import { mountsPerLaunch } from '../agents/vault-mount.js';
import { toFail } from '../lib/result.js';
import type { InstructionStatus } from './instructions.js';
import type { SessionRecord } from './record.js';

/**
 * Whether a session's agent has mesa-vault mounted, in the instruction hook's states: Claude
 * Code and Codex when their record says Mesa launched them with the mount (`vaultMounted`,
 * agents/vault-mount.ts); Antigravity from Mesa's one global entry and allow rule.
 * Configuration, not proof that the server answered.
 */
export function vaultStatus(
  record: Pick<SessionRecord, 'agent' | 'vaultMounted' | 'lastState'>,
  home: string,
  self: readonly string[],
): InstructionStatus {
  if (record.agent === 'terminal')
    return { state: 'unsupported', reason: 'A plain terminal runs no agent' };
  if (mountsPerLaunch(record.agent)) {
    if (record.vaultMounted)
      return { state: 'configured', reason: 'mesa-vault is mounted in its launch command' };
    // Queued, only recorded (mesa adopt --no-resume), or launched before the mount existed.
    return record.lastState.state === 'queued'
      ? { state: 'missing', reason: 'Mounted when the queued session starts' }
      : { state: 'missing', reason: 'Resume through Mesa to mount the vault' };
  }
  try {
    const mount = vaultMountStatus(home, self);
    if (mount.conflict) return { state: 'conflicting', reason: mount.conflict };
    if (mount.stale)
      return {
        state: 'conflicting',
        reason: 'Mesa mesa-vault entry is stale; run mesa hooks install',
      };
    if (!mount.server) return { state: 'missing', reason: 'Run mesa hooks install' };
    if (mount.disabled)
      return { state: 'missing', reason: 'mesa-vault is disabled in Antigravity; enable it there' };
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
