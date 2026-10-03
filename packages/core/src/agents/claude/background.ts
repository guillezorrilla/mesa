import type { Env, Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { type LaunchDefaults, launchFlags } from '../launch-flags.js';
import { claudeVaultArgs, type VaultServer } from '../vault-mount.js';

const TIMEOUT_MS = 20_000;
const ID = /backgrounded\s+[^\w\s]?\s*([0-9a-f]{8})\b/i;

export const claudeBackgroundAttach = (id: string) => `exec claude attach ${id}`;

/**
 * Claude owns the background process, with the profile's launch defaults, mesa-vault mounted, and
 * `dirs`, an additional project's worktree each (CONTEXT.md, Additional project). Its short ID
 * is the handle for attach and stop. The job runs in a process Claude's supervisor starts, with the supervisor's
 * environment, never `env`; so the session's `binding` (its window variables) goes in the
 * launch's settings `env`, which Claude applies to that process and keeps through its restarts,
 * for the mesa-vault server and the Mesa hooks to read (ADR-0012).
 */
export async function startClaudeBackground(
  run: Runner,
  cwd: string,
  server: VaultServer,
  binding: Readonly<Record<string, string>>,
  defaults: LaunchDefaults,
  dirs: readonly string[],
  goal?: string,
  mode?: 'plan',
  env?: Env,
) {
  const args = [
    '--bg',
    ...(mode ? ['--permission-mode', mode] : []),
    ...launchFlags('claude', defaults, mode),
    `--settings=${JSON.stringify({ env: binding })}`,
    ...claudeVaultArgs(server),
    // The = form: --add-dir takes every word after it, the goal too.
    ...dirs.map((dir) => `--add-dir=${dir}`),
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
