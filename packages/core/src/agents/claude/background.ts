import type { Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { claudeVaultArgs, type VaultServer } from '../vault-mount.js';

const TIMEOUT_MS = 20_000;
const ID = /backgrounded\s+[^\w\s]?\s*([0-9a-f]{8})\b/i;

export const claudeBackgroundAttach = (id: string) => `exec claude attach ${id}`;

/**
 * Claude owns the background process, with mesa-vault mounted. Its short ID is the handle for
 * attach and stop.
 */
export async function startClaudeBackground(
  run: Runner,
  cwd: string,
  server: VaultServer,
  goal?: string,
  mode?: 'plan',
  env?: Readonly<Record<string, string | undefined>>,
) {
  const args = [
    '--bg',
    ...(mode ? ['--permission-mode', mode] : []),
    ...claudeVaultArgs(server),
    ...(goal ? [goal] : []),
  ];
  const result = await run('claude', args, TIMEOUT_MS, { cwd, env });
  if (!result.ok)
    throw new MesaError('agent_unavailable', `Claude background start failed: ${result.detail}`);
  const id = result.stdout.match(ID)?.[1];
  if (!id)
    throw new MesaError('agent_unavailable', 'Claude background start returned no session ID');
  return id;
}

export async function stopClaudeBackground(run: Runner, id: string) {
  const result = await run('claude', ['stop', id], TIMEOUT_MS);
  if (!result.ok && !result.detail.includes(`No job matching '${id}'`))
    throw new MesaError('agent_unavailable', `Claude background stop failed: ${result.detail}`);
}
