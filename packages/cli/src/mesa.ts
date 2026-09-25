#!/usr/bin/env node
import { randomBytes, randomUUID } from 'node:crypto';
import { writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { execRunner, macObsidianPaths, systemClock, ulidSource } from '@mesa/core';
import { runCli } from './cli.js';
import { COMMANDS } from './commands/index.js';

// The CLI entrypoint: the only place that reads process globals or picks the real implementations;
// createMesa (the composition root) wires them.
const argv = process.argv.slice(2);
const { code, stdout, stderr, exec } = await runCli(argv, {
  commands: COMMANDS,
  env: process.env,
  tty: Boolean(process.stdin.isTTY),
  mesa: {
    home: homedir(),
    cwd: process.cwd(),
    clock: systemClock,
    newId: ulidSource(systemClock, randomBytes),
    newUuid: randomUUID,
    sleep: async (ms) => {
      await sleep(ms);
    },
    env: process.env,
    run: execRunner,
    obsidian: macObsidianPaths(homedir()),
    argv,
  },
});
if (exec) {
  // Written synchronously: execve replaces the process before an async write could flush.
  writeSync(1, stdout);
  // env finds the binary on PATH, which execve alone does not. Node 24 (the README's) has execve.
  if (!process.execve) throw new Error('mesa needs Node 24 for process.execve');
  process.execve('/usr/bin/env', ['env', ...exec], process.env);
}
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
