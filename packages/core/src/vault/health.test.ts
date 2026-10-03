import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { projectProfile, scriptedRunner, tempDir } from '../testing/index.js';

test('health reports actionable knowledge findings with file lines without changing the vault', () => {
  const { mesa, home } = projectProfile(scriptedRunner().run);
  const vault = join(home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(join(vault, path, '..'), { recursive: true });
    writeFileSync(join(vault, path), text);
  };
  put('index.md', '# Index\n\n- [[wiki/notes/rule]]: rule\n- [[wiki/gone]]: gone\n');
  put(
    'wiki/notes/rule.md',
    '---\nproject: lantern-cove\n---\n# Rule\n[[missing]]\n[[same]]\n`[[ignored]]`\n',
  );
  put('wiki/a/same.md', '---\nproject: lantern-cove\n---\n# A\n');
  put('wiki/b/same.md', '---\nproject: lantern-cove\n---\n# B\n');
  put('wiki/unassigned.md', '# Unassigned\n');
  put('raw/source.md', '# Source\n[[not-a-knowledge-link]]\n');
  put('daily/2026-09-24.md', '# Daily\n[[not-a-knowledge-link]]\n');
  const snapshot = () => {
    const files = readdirSync(vault, { recursive: true, withFileTypes: true }).filter((e) =>
      e.isFile(),
    );
    return files.map((e) => {
      const path = join(e.parentPath, e.name);
      return [path, readFileSync(path, 'utf8'), statSync(path).mtimeMs];
    });
  };
  const before = snapshot();
  const report = mesa.vault.health();
  expect(report.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'stale-index',
        path: 'index.md',
        line: 4,
        target: 'wiki/gone',
      }),
      expect.objectContaining({
        kind: 'broken-link',
        path: 'wiki/notes/rule.md',
        line: 5,
        target: 'missing',
      }),
      expect.objectContaining({
        kind: 'ambiguous-link',
        path: 'wiki/notes/rule.md',
        line: 6,
        candidates: ['wiki/a/same.md', 'wiki/b/same.md'],
      }),
      expect.objectContaining({ kind: 'orphan-note', path: 'wiki/unassigned.md' }),
      expect.objectContaining({ kind: 'missing-project', path: 'wiki/unassigned.md' }),
    ]),
  );
  expect(
    report.findings.some(
      (f) => f.target === 'ignored' || f.path.startsWith('raw/') || f.path.startsWith('daily/'),
    ),
  ).toBe(false);
  expect(
    report.findings.some((f) => f.kind === 'orphan-note' && f.path === 'wiki/notes/rule.md'),
  ).toBe(false);
  expect(mesa.vault.health()).toEqual(report);
  expect(snapshot()).toEqual(before);
});

test('health explains invalid metadata and unavailable aliases without following them outside scope', () => {
  const { mesa, home } = projectProfile(scriptedRunner().run);
  const vault = join(home, 'vault');
  const outside = join(tempDir(), 'private.md');
  writeFileSync(outside, 'PRIVATE OUTSIDE MARKER');
  writeFileSync(join(vault, 'wiki/bad-yaml.md'), '---\nproject: [\n---\n# Bad\n');
  writeFileSync(join(vault, 'wiki/bad-shape.md'), '---\n- one\n- two\n---\n# Bad\n');
  writeFileSync(join(vault, 'wiki/unclosed.md'), '---\nproject: lantern-cove\n');
  symlinkSync(outside, join(vault, 'wiki/escape.md'));
  mkdirSync(join(vault, '.obsidian'));
  writeFileSync(join(vault, '.obsidian/private.md'), 'PRIVATE INTERNAL MARKER');
  symlinkSync(join(vault, '.obsidian/private.md'), join(vault, 'wiki/internal.md'));
  const report = mesa.vault.health();
  for (const path of ['wiki/bad-yaml.md', 'wiki/bad-shape.md', 'wiki/unclosed.md']) {
    expect(report.findings).toContainEqual(
      expect.objectContaining({ kind: 'invalid-frontmatter', path, line: 1 }),
    );
  }
  for (const path of ['wiki/escape.md', 'wiki/internal.md']) {
    expect(report.findings).toContainEqual(
      expect.objectContaining({ kind: 'unavailable-item', path }),
    );
  }
  expect(JSON.stringify(report)).not.toContain('PRIVATE');
  expect(readFileSync(outside, 'utf8')).toBe('PRIVATE OUTSIDE MARKER');
  rmSync(vault, { recursive: true });
  expect(() => mesa.vault.health()).toThrow('run mesa vault init');
});

test('health recognizes connected notes and project hubs, ignores self/code links, and leaves clean vaults clean', () => {
  const { mesa, home } = projectProfile(scriptedRunner().run);
  const vault = join(home, 'vault');
  writeFileSync(join(vault, 'projects/lantern-cove.md'), '# Hub\n[[wiki/rule]]\n');
  writeFileSync(
    join(vault, 'wiki/rule.md'),
    '---\r\nproject: lantern-cove\r\n---\r\n# Rule\r\n[[projects/lantern-cove#Unverified heading]]\r\n```md\r\n[[missing]]\r\n```\r\n',
  );
  expect(mesa.vault.health().findings).toEqual([]);
  writeFileSync(
    join(vault, 'wiki/self.md'),
    '---\nproject: lantern-cove\n---\n# Self\n[[#Self]]\n',
  );
  expect(mesa.vault.health().findings).toEqual([
    expect.objectContaining({ kind: 'orphan-note', path: 'wiki/self.md' }),
  ]);
});
