import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { fakeRelease, tempDir, testDeps } from '../testing/index.js';

const about = (deps: Parameters<typeof testDeps>[1] = {}) =>
  createMesa('default', testDeps(tempDir(), deps)).about();

const LINKS = {
  docs: 'https://github.com/guillezorrilla/mesa#readme',
  support: 'https://github.com/guillezorrilla/mesa/issues',
  releases: 'https://github.com/guillezorrilla/mesa/releases',
};

test("a release build reports its version, build, links and the attributions file's entries", () => {
  const found = about({ release: fakeRelease() });
  expect(found).toMatchObject({
    version: '0.1.0-beta.4',
    build: '512',
    license: 'MIT',
    links: LINKS,
  });
  expect(found.note).toBeUndefined();
  expect(found.attributions.map((a) => [a.source, a.name, a.license])).toEqual([
    ['node', 'node', 'MIT'],
    ['npm', 'harbor-lights', 'MIT'],
    ['crate', 'tauri', 'Apache-2.0 OR MIT'],
    ['skill', 'tide-tables', 'MIT'],
  ]);
  expect(found.attributions[2]?.text).toContain('Apache License');
});

test('outside the single executable the build is dev, with no attributions and a note', () => {
  const found = about();
  expect(found).toMatchObject({
    version: '0.1.0-beta.4',
    build: 'dev',
    links: LINKS,
    attributions: [],
  });
  expect(found.note).toMatch(/scripts\/release\/licenses\.mjs/);
});

test('an attributions file that does not read gives an empty list and a note, never a crash', () => {
  for (const file of ['not json', '[{"name":"tauri"}]']) {
    const found = about({ release: fakeRelease(file) });
    expect(found).toMatchObject({ build: '512', attributions: [] });
    expect(found.note).toMatch(/does not read/);
  }
});
