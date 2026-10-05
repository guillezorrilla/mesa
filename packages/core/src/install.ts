import { INSTALLABLE } from './doctor.js';
import type { Runner } from './lib/process.js';
import { MesaError } from './lib/result.js';

// ponytail: 15 minutes for a cask download on a slow line; stream progress if users wait longer.
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Installs a missing requirement (tmux or an agent) with its Homebrew command. Mesa never
 * installs Homebrew itself: that needs sudo and a password prompt.
 */
export async function installRequirement(run: Runner, name: string) {
  const command = INSTALLABLE.get(name);
  if (!command)
    throw new MesaError(
      'usage',
      `cannot install ${name}; one of: ${[...INSTALLABLE.keys()].join(', ')}`,
    );
  const res = await run('brew', command.split(' ').slice(1), INSTALL_TIMEOUT_MS);
  if (res.ok) return { name, installed: true as const };
  if (res.reason === 'missing')
    throw new MesaError(
      'not_found',
      `Homebrew is not installed; see https://brew.sh, then run \`${command}\``,
    );
  throw new MesaError('internal', `\`${command}\` failed: ${res.detail}`);
}
