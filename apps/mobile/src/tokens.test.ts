import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const desktop = read('../../desktop/src/style.css');
const mobile = read('./global.css');

/** The `--name: value` declarations in the first block after `opening`. */
function declarations(css: string, opening: RegExp): Map<string, string> {
  const start = css.search(opening);
  if (start < 0) throw new Error(`no block ${opening}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return new Map(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
}

const themes = [
  { name: 'light', desktop: /^:root \{/m, mobile: /@variant light \{/ },
  { name: 'dark', desktop: /^:root\[data-theme="dark"\] \{/m, mobile: /@variant dark \{/ },
];

test.each(themes)("every $name colour on the phone is the desktop's", (theme) => {
  const ours = declarations(mobile, theme.mobile);
  const theirs = declarations(desktop, theme.desktop);
  expect(ours.size).toBeGreaterThan(20);
  for (const [name, value] of ours) {
    const token = name.replace(/^color-/, '');
    expect({ token, value }).toEqual({ token, value: theirs.get(token) });
  }
});

test("the phone's radius is the desktop's", () => {
  expect(declarations(mobile, /@theme \{/).get('radius')).toBe(
    declarations(desktop, /^:root \{/m).get('radius'),
  );
});
