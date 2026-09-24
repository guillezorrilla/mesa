#!/usr/bin/env node
import { homedir } from 'node:os';
import { execRunner, OBSIDIAN_PATHS, systemClock } from '@mesa/core';
import { runCli } from './cli.js';
import { COMMANDS } from './commands/index.js';

// The CLI entrypoint: the only place that reads process globals or picks the real implementations;
// createMesa (the composition root) wires them.
const { code, stdout, stderr } = await runCli(process.argv.slice(2), {
  commands: COMMANDS,
  env: process.env,
  mesa: {
    home: homedir(),
    cwd: process.cwd(),
    clock: systemClock,
    run: execRunner,
    obsidian: OBSIDIAN_PATHS,
  },
});
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
