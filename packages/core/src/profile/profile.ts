import { existsSync, mkdirSync } from 'node:fs';
import type { Env } from '../lib/process.js';
import { writeYaml } from '../lib/yaml-file.js';
import { buildConfig, CONFIG_HEADER, type Config, loadConfig } from './config.js';
import type { ProfilePaths } from './paths.js';

const DEFAULT_PROFILE = 'default';

declare const opened: unique symbol;

/**
 * An initialised profile: where its files live and its validated config. Branded so only
 * `openProfile` can make one, which is why a function taking a Profile needs no "has mesa init
 * run?" check of its own.
 */
export type Profile = { paths: ProfilePaths; config: Config; readonly [opened]: true };

/** What `mesa profile` reports: the active profile's name and directory. */
export type ProfileInfo = { profile: string; dir: string };

/** The --profile flag wins over MESA_PROFILE, which wins over `default`. */
export function resolveProfileName(flag: string | undefined, env: Env): string {
  return flag ?? env.MESA_PROFILE ?? DEFAULT_PROFILE;
}

/** Loads an initialised profile; not_found with the `mesa init` hint otherwise. */
export function openProfile(paths: ProfilePaths): Profile {
  return { paths, config: loadConfig(paths.config) } as Profile;
}

/**
 * Creates the profile dir (0700), `sessions/`, and `config.yaml` (0600) with the defaults filled
 * in. The input is validated first, so an invalid one leaves nothing behind; a second run, or
 * losing a race with a concurrent one, changes nothing.
 */
export function initProfile(
  paths: ProfilePaths,
  input: { vault: string; agent?: string },
): { created: boolean; path: string } {
  if (existsSync(paths.config)) return { created: false, path: paths.config };
  const config = buildConfig({ vault: input.vault, defaultAgent: input.agent }, paths.config);
  mkdirSync(paths.sessions, { recursive: true, mode: 0o700 });
  const created = writeYaml(paths.config, config, {
    header: CONFIG_HEADER,
    mode: 0o600,
    exclusive: true,
  });
  return { created, path: paths.config };
}
