import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import type { RepositoryUrl } from './project-url.js';
import { registerProject } from './projects.js';

/** Clone into this profile's private checkouts, then register the new project atomically. */
export async function cloneProject(profile: Profile, run: Runner, source: RepositoryUrl) {
  const { url, slug } = source;
  const path = join(profile.paths.checkouts, slug);
  mkdirSync(profile.paths.checkouts, { recursive: true, mode: 0o700 });
  try {
    mkdirSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new MesaError('usage', `${path} already exists; choose a different repository`);
    }
    throw error;
  }
  let registered = false;
  try {
    // ponytail: a large remote may need longer than two minutes; raise only after a real timeout.
    const cloned = await run('git', ['clone', '--', url, path], 120_000);
    if (!cloned.ok) {
      throw new MesaError(
        cloned.reason === 'missing' || cloned.reason === 'timeout' ? 'internal' : 'usage',
        cloned.reason === 'missing'
          ? 'git not found on PATH'
          : cloned.reason === 'timeout'
            ? 'git clone timed out after two minutes'
            : `git clone failed: ${cloned.detail}`,
      );
    }
    const result = registerProject(profile, { dir: path, create: true });
    registered = true;
    return { ...result, url };
  } finally {
    if (!registered) rmSync(path, { recursive: true, force: true });
  }
}
