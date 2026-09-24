#!/usr/bin/env node
import { COMMANDS } from './commands.js';
import { runCli } from './registry.js';

const { code, stdout, stderr } = await runCli(process.argv.slice(2), COMMANDS, process.env);
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
