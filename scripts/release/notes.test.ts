import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChangelog } from '@mesa/core/browser';
import { tempDir, testEnv, testGit } from '@mesa/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { changeNote, changes, published, section, withSection, writeNotes } from './notes.mjs';

const note = (type: string, text: string) => `---\ntype: ${type}\n---\n\n${text}\n`;

describe('section', () => {
  it('groups notes as Added, Changed and Fixed, each with its pull request, and leaves empty groups out', () => {
    const text = section('0.1.6', '2026-10-06', [
      { type: 'fixed', note: 'The board keeps its scroll.', pr: '12' },
      { type: 'added', note: 'Recency grouping in the minimap.', pr: '11' },
      { type: 'added', note: 'A note not merged yet.' },
    ]);
    expect(text).toBe(`## 0.1.6 - 2026-10-06

### Added

- Recency grouping in the minimap. (#11)
- A note not merged yet.

### Fixed

- The board keeps its scroll. (#12)
`);
  });

  it('keeps the lines of an earlier section of the version, once each', () => {
    const kept = '### Fixed\n\n- The board keeps its scroll. (#12)';
    const again = [
      { type: 'fixed', note: 'The board keeps its scroll.', pr: '12' },
      { type: 'changed', note: 'The tide table opens faster.', pr: '13' },
    ];
    expect(section('0.1.6', '2026-10-06', again, kept)).toBe(
      '## 0.1.6 - 2026-10-06\n\n### Changed\n\n- The tide table opens faster. (#13)\n\n### Fixed\n\n- The board keeps its scroll. (#12)\n',
    );
  });

  it('writes a section the core parser reads back, so the two cannot drift', () => {
    const text = section('0.1.6-beta.1', '2026-10-06', [
      { type: 'added', note: 'Recency grouping in the minimap.', pr: '11' },
      { type: 'changed', note: 'The tide table opens faster.', pr: '13' },
      { type: 'fixed', note: 'The board keeps its scroll.' },
    ]);
    expect(parseChangelog(withSection('', '0.1.6-beta.1', text))).toEqual([
      {
        version: '0.1.6-beta.1',
        date: '2026-10-06',
        added: ['Recency grouping in the minimap.'],
        changed: ['The tide table opens faster.'],
        fixed: ['The board keeps its scroll.'],
      },
    ]);
  });
});

describe('change files', () => {
  it('reads the type and the note as one line', () => {
    expect(changeNote('changes/a.md', note('changed', 'The board\nopens faster.'))).toEqual({
      type: 'changed',
      note: 'The board opens faster.',
    });
  });

  it('fails a file with a bad type, or no front matter, naming its path', () => {
    expect(() => changeNote('changes/tide.md', note('feature', 'x'))).toThrow(/^changes\/tide\.md: /);
    expect(() => changeNote('changes/kelp.md', 'Just a note.')).toThrow(/^changes\/kelp\.md: /);
    expect(() => changeNote('changes/reef.md', note('added', ''))).toThrow(/^changes\/reef\.md: /);
  });
});

describe('a release', () => {
  let dir: string;
  const changelog = () => readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
  const merge = (pr: number, file: string, text: string) => {
    writeFileSync(join(dir, 'changes', file), text);
    testGit(dir, 'add', '-A');
    testGit(dir, 'commit', '-q', '-m', `feat(app): add ${file} (#${pr})`);
  };
  const release = (version: string) => {
    const text = writeNotes(version, dir, '2026-10-06', testEnv);
    testGit(dir, 'add', '-A');
    testGit(dir, 'commit', '-q', '-m', `chore(release): ${version}`);
    testGit(dir, 'tag', `v${version}`);
    return text;
  };
  beforeEach(() => {
    dir = tempDir();
    mkdirSync(join(dir, 'changes'));
    writeFileSync(join(dir, 'changes/README.md'), '# Change files\n');
    writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## 0.1.5 - 2026-10-05\n\n### Fixes\n\n- **app**: old (#2)\n');
    testGit(dir, 'init', '-q', '-b', 'main');
    testGit(dir, 'add', '-A');
    testGit(dir, 'commit', '-q', '-m', 'chore(release): 0.1.5');
    testGit(dir, 'tag', 'v0.1.5');
  });

  it('finds each note pull request from the commit that added its file', () => {
    merge(21, 'minimap.md', note('added', 'Recency grouping.'));
    writeFileSync(join(dir, 'changes/draft.md'), note('fixed', 'Not merged yet.'));
    expect(changes('0.1.6', dir, testEnv)).toEqual([
      { path: 'changes/draft.md', type: 'fixed', note: 'Not merged yet.', pr: undefined },
      { path: 'changes/minimap.md', type: 'added', note: 'Recency grouping.', pr: '21' },
    ]);
  });

  it('takes the pull request of the newest commit that added a file, when a slug comes back', () => {
    merge(21, 'minimap.md', note('added', 'Recency grouping.'));
    release('0.1.6');
    merge(31, 'minimap.md', note('added', 'Recency grouping by day.'));
    expect(changes('0.1.7', dir, testEnv)).toMatchObject([{ path: 'changes/minimap.md', pr: '31' }]);
  });

  it('a beta collects only the files added since the last tag and keeps them; the stable release collects every one and deletes them', () => {
    merge(21, 'minimap.md', note('added', 'Recency grouping.'));
    expect(release('0.1.6-beta.1')).toContain('- Recency grouping. (#21)');
    merge(22, 'scroll.md', note('fixed', 'The board keeps its scroll.'));
    const beta = release('0.1.6-beta.2');
    expect(beta).toContain('- The board keeps its scroll. (#22)');
    expect(beta).not.toContain('Recency');
    expect(existsSync(join(dir, 'changes/minimap.md'))).toBe(true);

    const stable = release('0.1.6');
    expect(stable).toBe(
      '## 0.1.6 - 2026-10-06\n\n### Added\n\n- Recency grouping. (#21)\n\n### Fixed\n\n- The board keeps its scroll. (#22)\n',
    );
    expect(existsSync(join(dir, 'changes/minimap.md'))).toBe(false);
    expect(existsSync(join(dir, 'changes/scroll.md'))).toBe(false);
    expect(existsSync(join(dir, 'changes/README.md'))).toBe(true);
    expect(published(changelog(), '0.1.5')).toBe('### Fixes\n\n- **app**: old (#2)');
  });

  it('a stable release run again keeps its notes and adds what was merged since', () => {
    merge(21, 'minimap.md', note('added', 'Recency grouping.'));
    writeNotes('0.1.6', dir, '2026-10-06', testEnv);
    merge(23, 'tide.md', note('changed', 'The tide table opens faster.'));
    writeNotes('0.1.6', dir, '2026-10-06', testEnv);
    expect(published(changelog(), '0.1.6')).toBe(
      '### Added\n\n- Recency grouping. (#21)\n\n### Changed\n\n- The tide table opens faster. (#23)',
    );
  });

  it('writes no section and deletes nothing when a change file does not read', () => {
    merge(21, 'minimap.md', note('added', 'Recency grouping.'));
    merge(24, 'bad.md', note('feature', 'Nope.'));
    expect(() => writeNotes('0.1.6', dir, '2026-10-06', testEnv)).toThrow(/changes\/bad\.md/);
    expect(changelog()).not.toContain('0.1.6');
    expect(existsSync(join(dir, 'changes/minimap.md'))).toBe(true);
  });
});

describe('CHANGELOG.md', () => {
  const old = '## 0.1.1 - 2026-10-03\n\n### Fixes\n\n- **app**: old (#2)\n';
  const fresh = '## 0.1.2 - 2026-10-04\n\n### Added\n\n- New. (#3)\n';

  it('adds a section under the title, creating the title when the file is missing', () => {
    expect(withSection('', '0.1.2', fresh)).toBe(`# Changelog\n\n${fresh}`);
    expect(withSection(`# Changelog\n\n${old}`, '0.1.2', fresh)).toBe(
      `# Changelog\n\n${fresh}\n${old}`,
    );
  });

  it('replaces the section of the same version in its place instead of adding another', () => {
    const once = withSection(`# Changelog\n\n${old}`, '0.1.2', fresh);
    const again = fresh.replace('New', 'Newer');
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
