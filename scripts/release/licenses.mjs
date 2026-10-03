// Writes the third-party attributions a release ships (#478) to one JSON file, which build.sh
// embeds in the CLI's single executable: [{ name, version, license, source, text }] for the Node
// running this script (build.sh runs the pinned one), the production npm packages bundled into
// the CLI and the app, the Rust crates of the macOS app, and each vendored skill with a license.
//
//   node scripts/release/licenses.mjs <out.json>
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/release/licenses.mjs <out.json>');
  process.exit(2);
}
const root = join(import.meta.dirname, '..', '..');
const run = (file, args, cwd) =>
  JSON.parse(execFileSync(file, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));

/** The license and notice files in a package's folder, joined; empty when it ships none. */
function licenseText(dir) {
  return readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying|notice)/i.test(name))
    .sort()
    .map((name) => join(dir, name))
    .filter((file) => statSync(file).isFile())
    .map((file) => readFileSync(file, 'utf8').trim())
    .join('\n\n');
}

/** This Node, from the folder its tarball unpacked to (the LICENSE beside bin/). */
function node() {
  const dir = dirname(dirname(realpathSync(process.execPath)));
  const text = licenseText(dir);
  if (!text) throw new Error(`no LICENSE in ${dir}: run this with a Node from nodejs.org`);
  return [{ name: 'node', version: process.versions.node, license: 'MIT', source: 'node', text }];
}

/** @mesa/cli with the workspace packages it bundles (core), and the app's frontend. */
function npm() {
  const listed = run(
    'pnpm',
    [
      'licenses',
      'list',
      '--prod',
      '--json',
      '--filter',
      '@mesa/cli...',
      '--filter',
      '@mesa/desktop',
    ],
    root,
  );
  return Object.values(listed)
    .flat()
    .filter((p) => !p.name.startsWith('@mesa/'))
    .flatMap((p) =>
      p.versions.map((version, i) => ({
        name: p.name,
        version,
        license: p.license,
        source: 'npm',
        text: licenseText(p.paths[i]) || p.license,
      })),
    );
}

/** The crates the macOS app links: its normal dependencies, transitively, for both Mac targets. */
function crates() {
  const filters = ['aarch64-apple-darwin', 'x86_64-apple-darwin'].flatMap((t) => [
    '--filter-platform',
    t,
  ]);
  const meta = run(
    'cargo',
    ['metadata', '--format-version', '1', ...filters],
    join(root, 'apps/desktop/src-tauri'),
  );
  const packages = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const reached = new Set();
  const next = [meta.resolve.root];
  while (next.length) {
    const id = next.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    for (const dep of nodes.get(id).deps) {
      if (dep.dep_kinds.some((k) => k.kind === null)) next.push(dep.pkg);
    }
  }
  reached.delete(meta.resolve.root);
  return [...reached].map((id) => {
    const p = packages.get(id);
    const license = p.license ?? (p.license_file ? 'LicenseRef-file' : '');
    return {
      name: p.name,
      version: p.version,
      license,
      source: 'crate',
      text: licenseText(dirname(p.manifest_path)) || license,
    };
  });
}

/** Each vendored skill with a LICENSE or NOTICE; its version is the upstream commit it names. */
function skills() {
  const dir = join(root, 'skills');
  return readdirSync(dir).flatMap((name) => {
    const text = licenseText(join(dir, name));
    if (!text) return [];
    const license = /MIT License/.test(text)
      ? 'MIT'
      : /Apache License/.test(text)
        ? 'Apache-2.0'
        : '';
    const version = text.match(/commit ([0-9a-f]{7})/)?.[1] ?? 'vendored';
    return [{ name, version, license, source: 'skill', text }];
  });
}

const attributions = [...node(), ...npm(), ...crates(), ...skills()];
const unlicensed = attributions.filter((a) => !a.license);
if (unlicensed.length) {
  throw new Error(`no license for ${unlicensed.map((a) => `${a.source} ${a.name}`).join(', ')}`);
}
attributions.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
writeFileSync(out, JSON.stringify(attributions));
const count = (source) => attributions.filter((a) => a.source === source).length;
console.log(
  `licenses: ${count('node')} node, ${count('npm')} npm, ${count('crate')} crate, ${count('skill')} skill into ${out}`,
);
