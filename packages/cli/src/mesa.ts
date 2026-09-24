#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { profileDir, resolveProfile, VERSION } from '@mesa/core';

try {
  const { values, positionals } = parseArgs({
    options: {
      version: { type: 'boolean' },
      help: { type: 'boolean' },
      profile: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(VERSION);
  } else if (values.help || positionals.length === 0) {
    console.log(
      'Usage: mesa [--profile <name>] [--json] <command>. Global flags: --profile <name> selects the active profile; --json prints JSON. Commands: profile shows the active profile. Use --version for the version or --help for help.',
    );
  } else if (positionals[0] === 'profile' && positionals.length === 1) {
    const profile = resolveProfile({ flag: values.profile, env: process.env });
    console.log(values.json ? JSON.stringify({ profile, dir: profileDir(profile) }) : profile);
  } else {
    throw new Error(`Unknown command: ${positionals.join(' ')}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
