// node scripts/domain-cycles.mjs: lists the two-way domain imports in packages/core/src.
// A domain is a file's first path segment under src (a top-level file is its own domain, named
// without its extension). Each pair is printed `a <-> b` when a file in a imports from b and a
// file in b imports from a. Every relative specifier counts: `import`, `import type`,
// `export ... from` and `import()`. Test files (*.test.ts, *.test.tsx) are left out: they consume
// the domains rather than form them.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { importSpecifiers } from './import-specifiers.mjs';

const src = new URL('../packages/core/src', import.meta.url).pathname;
const domainOf = (file) => {
  const [first, ...rest] = relative(src, file).split(sep);
  return rest.length > 0 ? first : first.replace(/\.[^.]+$/, '');
};

const edges = new Map();
for (const entry of readdirSync(src, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
  const file = join(entry.parentPath, entry.name);
  const from = domainOf(file);
  for (const { specifier: spec } of importSpecifiers(readFileSync(file, 'utf8'))) {
    if (!spec.startsWith('.')) continue;
    const target = join(dirname(file), spec);
    if (relative(src, target).startsWith('..')) continue;
    const to = domainOf(target);
    if (to === from) continue;
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  }
}

const pairs = [];
for (const [a, targets] of edges) {
  for (const b of targets) if (a < b && edges.get(b)?.has(a)) pairs.push(`${a} <-> ${b}`);
}
console.log(pairs.sort().join('\n') || 'no two-way domain imports');
