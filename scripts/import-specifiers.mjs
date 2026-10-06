// The module specifiers a TypeScript source imports or re-exports, one statement at a time:
// `import ... from`, `export {...} from` and `export * from` (with `type` or not), a bare
// `import '...'`, and `import('...')`. Each comes with whether only types come through it.
const statement =
  /^\s*import\s+(type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*export\s+(type\s+)?[*{][^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/gm;

/** @param {string} source @returns {{ specifier: string, typeOnly: boolean }[]} */
export function importSpecifiers(source) {
  return [...source.matchAll(statement)].map(
    ([, importType, imported, exportType, reexported, bare, dynamic]) => ({
      specifier: imported ?? reexported ?? bare ?? dynamic,
      typeOnly: Boolean(importType ?? exportType),
    }),
  );
}
