import { homedir } from 'node:os';
import { join } from 'node:path';

export const VERSION = '0.1.0';

export function resolveProfile(opts: { flag?: string; env?: NodeJS.ProcessEnv }): string {
  return opts.flag ?? opts.env?.MESA_PROFILE ?? 'default';
}

export function profileDir(profile: string, home = homedir()): string {
  return join(home, '.mesa', profile);
}

export * from './config.js';
export * from './doctor.js';
export * from './result.js';
