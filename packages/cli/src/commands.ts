import { profileDir } from '@mesa/core';
import type { Command } from './registry.js';

// Every mesa subcommand is one entry here; help and flag parsing come from the registry.
export const COMMANDS: Command[] = [
  {
    name: 'profile',
    summary: 'Show the active profile and its directory',
    run: ({ profile }) => ({ data: { profile, dir: profileDir(profile) }, text: profile }),
  },
];
