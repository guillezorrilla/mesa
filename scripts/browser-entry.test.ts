import { readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { importSpecifiers } from './import-specifiers.mjs';

const src = fileURLToPath(new URL('../packages/core/src', import.meta.url));

/** Each Node built-in a core module reaches from `entry` through value imports: `<module> imports <built-in>`. */
function builtinsReached(entry: string): string[] {
  const reached: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { specifier, typeOnly } of importSpecifiers(readFileSync(file, 'utf8'))) {
      if (typeOnly) continue;
      if (isBuiltin(specifier)) reached.push(`${relative(src, file)} imports ${specifier}`);
      else if (specifier.startsWith('.'))
        visit(join(dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
  };
  visit(entry);
  return reached;
}

test('@mesa/core/browser reaches no Node built-in, so the app loads in the webview and under vite dev', () => {
  expect(builtinsReached(join(src, 'browser.ts'))).toEqual([]);
});
