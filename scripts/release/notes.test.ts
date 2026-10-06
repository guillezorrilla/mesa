import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, testEnv, testGit } from '@mesa/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { published, section, subjects, withSection } from './notes.mjs';

describe('section', () => {
  it('groups typed subjects, keeps legacy ones as Other and leaves version bumps out', () => {
    const notes = section('0.1.2', '2026-10-03', [
      'chore(release): 0.1.2 (#610)',
      'feat(sessions): queue a session after another (#609)',
      'feat: start without an area (#611)',
      'fix(vault): keep one index line per note (#608)',
      'perf(app): open the board faster (#607)',
      'feat(app)!: drop the old sidebar (#606)',
      'docs: say how releases work (#605)',
      'release: 0.1.1, the update the first smoke installs (#41) (#485)',
      'sessions: list native projects machine-wide (#495) (#502)',
      'Initial commit',
    ]);
    expect(notes).toBe(`## 0.1.2 - 2026-10-03

### Features

- **sessions**: queue a session after another (#609)
- start without an area (#611)

### Fixes

- **vault**: keep one index line per note (#608)

### Performance

- **app**: open the board faster (#607)

### Breaking changes

- **app**: drop the old sidebar (#606)

### Other

- **docs**: say how releases work (#605)
- **sessions**: list native projects machine-wide (#495) (#502)
- Initial commit
`);
  });

  it('leaves empty groups out', () => {
    expect(section('0.1.3-beta.1', '2026-10-04', ['fix(cli): exit 2 on a bad flag (#7)'])).toBe(
      '## 0.1.3-beta.1 - 2026-10-04\n\n### Fixes\n\n- **cli**: exit 2 on a bad flag (#7)\n',
    );
  });
});

describe('subjects', () => {
  const dir = tempDir();
  const commit = (subject: string, tag?: string) => {
    writeFileSync(join(dir, 'file'), subject);
    testGit(dir, 'add', '-A');
    testGit(dir, 'commit', '-q', '-m', subject);
    if (tag) testGit(dir, 'tag', tag);
  };
  beforeAll(() => {
    testGit(dir, 'init', '-q', '-b', 'main');
    commit('feat(a): one (#1)', 'v0.1.0');
    commit('fix(a): two (#2)', 'v0.1.1-beta.1');
    commit('feat(a): three (#3)');
  });

  it('takes a stable version from the last stable tag', () => {
    expect(subjects('0.1.1', dir, testEnv)).toEqual(['feat(a): three (#3)', 'fix(a): two (#2)']);
  });

  it('takes a beta from the last tag of any kind', () => {
    expect(subjects('0.1.1-beta.2', dir, testEnv)).toEqual(['feat(a): three (#3)']);
  });

  it('skips the tag of the version itself, so a tagged version reads the same', () => {
    testGit(dir, 'tag', 'v0.1.1');
    expect(subjects('0.1.1', dir, testEnv)).toEqual(['feat(a): three (#3)', 'fix(a): two (#2)']);
  });
});

describe('CHANGELOG.md', () => {
  const old = '## 0.1.1 - 2026-10-03\n\n### Fixes\n\n- **app**: old (#2)\n';
  const fresh = '## 0.1.2 - 2026-10-04\n\n### Features\n\n- **app**: new (#3)\n';

  it('adds a section under the title, creating the title when the file is missing', () => {
    expect(withSection('', '0.1.2', fresh)).toBe(`# Changelog\n\n${fresh}`);
    expect(withSection(`# Changelog\n\n${old}`, '0.1.2', fresh)).toBe(
      `# Changelog\n\n${fresh}\n${old}`,
    );
  });

  it('replaces the section of the same version in its place instead of adding another', () => {
    const once = withSection(`# Changelog\n\n${old}`, '0.1.2', fresh);
    const again = fresh.replace('new', 'newer');
    expect(withSection(once, '0.1.2', again)).toBe(`# Changelog\n\n${again}\n${old}`);
    const older = old.replace('old', 'older');
    expect(withSection(once, '0.1.1', older)).toBe(`# Changelog\n\n${fresh}\n${older}`);
  });

  it("reads a version's section without its heading, or nothing", () => {
    const changelog = `# Changelog\n\n${fresh}\n${old}`;
    expect(published(changelog, '0.1.1')).toBe('### Fixes\n\n- **app**: old (#2)');
    expect(published(changelog, '0.1.1-beta.1')).toBe('');
  });
});
