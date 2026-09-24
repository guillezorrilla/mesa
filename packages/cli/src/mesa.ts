#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  exitCode,
  MesaError,
  ok,
  profileDir,
  type Result,
  resolveProfile,
  toFail,
  VERSION,
} from '@mesa/core';

const USAGE =
  'Usage: mesa [--profile <name>] [--json] <command>. Global flags: --profile <name> selects the active profile; --json prints JSON. Commands: profile shows the active profile. Use --version for the version or --help for help.';

// Read before parsing so a parse error still honours --json.
const json = process.argv.includes('--json');

function parse() {
  try {
    return parseArgs({ options: OPTIONS, allowPositionals: true });
  } catch (error) {
    throw new MesaError('usage', error instanceof Error ? error.message : String(error));
  }
}

function run(): { data: unknown; text: string } {
  const { values, positionals } = parse();

  if (values.version) return { data: VERSION, text: VERSION };
  if (values.help || positionals.length === 0) return { data: USAGE, text: USAGE };
  if (positionals[0] === 'profile' && positionals.length === 1) {
    const profile = resolveProfile({ flag: values.profile, env: process.env });
    return { data: { profile, dir: profileDir(profile) }, text: profile };
  }
  throw new MesaError('usage', `Unknown command: ${positionals.join(' ')}`);
}

const OPTIONS = {
  version: { type: 'boolean' },
  help: { type: 'boolean' },
  profile: { type: 'string' },
  json: { type: 'boolean' },
} as const;

let result: Result<unknown>;
let text = '';
try {
  const out = run();
  result = ok(out.data);
  text = out.text;
} catch (error) {
  result = toFail(error);
}

if (json) console.log(JSON.stringify(result));
else if (result.ok) console.log(text);
else console.error(result.error.message);
process.exitCode = exitCode(result);
