#!/bin/sh
# One version for the app, the CLI and core (ADR-0017), held in every package.json, Cargo.toml and
# Cargo.lock; tauri.conf.json reads apps/desktop/package.json's.
#
#   scripts/release/version.sh                     print it
#   scripts/release/version.sh X.Y.Z[-beta.N]      write it everywhere
#   scripts/release/version.sh --check             exit 1, naming each file, on any drift
set -eu
cd "$(dirname "$0")/../.."
node --input-type=module - "${1:-}" <<'JS'
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [arg] = process.argv.slice(2);
const packages = execFileSync('git', ['ls-files', '*package.json'], { encoding: 'utf8' })
  .trim()
  .split('\n');
const want = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8')).version;
const cargo = 'apps/desktop/src-tauri/Cargo.toml';
const lock = 'apps/desktop/src-tauri/Cargo.lock';
const CARGO_RE = /^(\[package\][^[]*?\nversion = ")([^"]*)"/;
const LOCK_RE = /(\nname = "mesa-desktop"\nversion = ")([^"]*)"/;
const read = (file) => readFileSync(file, 'utf8');

if (arg === '--check') {
  const found = [
    ...packages.map((file) => [file, JSON.parse(read(file)).version]),
    [cargo, read(cargo).match(CARGO_RE)?.[2]],
    [lock, read(lock).match(LOCK_RE)?.[2]],
  ];
  const conf = JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json')).version;
  const drift = found.filter(([, version]) => version !== want).map(([f, v]) => `${f} has ${v}`);
  if (conf !== '../package.json') drift.push(`tauri.conf.json version is ${conf}, not ../package.json`);
  if (drift.length) {
    console.error(`version drift from apps/desktop/package.json (${want}):\n  ${drift.join('\n  ')}`);
    console.error('fix with: pnpm release:version <version>');
    process.exit(1);
  }
  console.log(`version ${want} everywhere`);
} else if (arg) {
  // Stable X.Y.Z or a beta X.Y.Z-beta.N, the two release channels.
  if (!/^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(arg)) {
    console.error(`not X.Y.Z or X.Y.Z-beta.N: ${arg}`);
    process.exit(2);
  }
  for (const file of packages) {
    const { version, ...rest } = JSON.parse(read(file));
    // version goes after name, where npm puts it.
    const { name, ...others } = rest;
    writeFileSync(file, `${JSON.stringify({ name, version: arg, ...others }, null, 2)}\n`);
  }
  writeFileSync(cargo, read(cargo).replace(CARGO_RE, `$1${arg}"`));
  writeFileSync(lock, read(lock).replace(LOCK_RE, `$1${arg}"`));
  console.log(`version ${arg} written`);
} else {
  console.log(want);
}
JS
