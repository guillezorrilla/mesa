#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { execRunner, OBSIDIAN_PATHS, systemClock, ulidSource } from '@mesa/core';
import { runCli } from './cli.js';
import { COMMANDS } from './commands/index.js';

// The CLI entrypoint: the only place that reads process globals or picks the real implementations;
// createMesa (the composition root) wires them.
const argv = process.argv.slice(2);
const { code, stdout, stderr } = await runCli(argv, {
  commands: COMMANDS,
  env: process.env,
  mesa: {
    home: homedir(),
    cwd: process.cwd(),
    clock: systemClock,
    newId: ulidSource(systemClock, randomBytes),
    env: process.env,
    run: execRunner,
    obsidian: OBSIDIAN_PATHS,
    argv,
  },
});
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
