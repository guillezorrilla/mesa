import { expect, test } from 'vitest';
import { changelogNotes, parseChangelog } from './notes.js';

const CHANGELOG = `# Changelog

Each version's changes, newest first.

## 0.3.0-beta.1 - 2026-10-12

### Added

- Recency grouping in the minimap: the Group by menu adds a Recency option. (#801)

### Fixed

- The lantern board keeps its scroll when a session ends. (#802)

## 0.2.0 - 2026-10-08

### Features

- **decisions**: smarter decisions with your own key (#669, #670)
- **tide**: start without an area (#611) (#612)

### Fixes

- **app**, **sessions**: keep the window in place (#667)

### Performance

- **app**: open the board faster (#607)

### Breaking changes

- **cli**: \`--until-done\` is gone (#606)

### Other

- **readme**: the new decision models (#676)
`;

test('reads Keep a Changelog sections and older ones, newest first, without references or areas', () => {
  expect(parseChangelog(CHANGELOG)).toEqual([
    {
      version: '0.3.0-beta.1',
      date: '2026-10-12',
      added: ['Recency grouping in the minimap: the Group by menu adds a Recency option.'],
      changed: [],
      fixed: ['The lantern board keeps its scroll when a session ends.'],
    },
    {
      version: '0.2.0',
      date: '2026-10-08',
      added: ['Smarter decisions with your own key', 'Start without an area'],
      changed: ['Open the board faster', '`--until-done` is gone'],
      fixed: ['Keep the window in place'],
    },
  ]);
});

test('a missing or unreadable changelog gives no notes rather than an error', () => {
  expect(changelogNotes(undefined)).toEqual([]);
  expect(
    changelogNotes(() => {
      throw new Error('ENOENT: no such file, CHANGELOG.md');
    }),
  ).toEqual([]);
  expect(changelogNotes(() => '# Changelog\n')).toEqual([]);
});

test('a note ending in many reference-like characters parses in linear time', () => {
  const note = `- Tide ${'(#9'.repeat(20_000)}${'\t'.repeat(20_000)} (#1, #2) (#3)`;
  const started = performance.now();
  const [section] = parseChangelog(`## 0.1.0 - 2026-10-01\n\n### Added\n\n${note}\n`);
  expect(performance.now() - started).toBeLessThan(500);
  expect(section?.added[0]).toBe(`Tide ${'(#9'.repeat(20_000)}`);
});
