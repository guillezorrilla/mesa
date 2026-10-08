import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { freshProject, selfCheck } from './harness.mjs';

test('every paired task fails as given, passes with its reference and fails with its naive solution', () => {
  const work = mkdtempSync(join(tmpdir(), 'paired-check-'));
  try {
    const result = selfCheck(work);
    expect(result.tasks.map((r: { task: string; ok: boolean }) => [r.task, r.ok])).toEqual([
      ['format-amount', true],
      ['log-line', true],
      ['parse-weight', true],
      ['retry-manifest', true],
      ['shipment-id', true],
      ['sort-shipments', true],
    ]);
    expect(result).toMatchObject({ notes: 10, ok: true });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('a Codex project gets the paired-task skill where Codex reads it, committed with the rest', () => {
  const work = mkdtempSync(join(tmpdir(), 'paired-codex-'));
  try {
    const claude = join(work, 'claude');
    freshProject(claude);
    expect(existsSync(join(claude, '.agents'))).toBe(false);
    const codex = join(work, 'codex');
    freshProject(codex, 'codex');
    const skill = (dir: string, home: string) =>
      readFileSync(join(dir, home, 'skills', 'paired-task', 'SKILL.md'), 'utf8');
    expect(skill(codex, '.agents')).toBe(skill(codex, '.claude'));
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: codex, encoding: 'utf8' });
    expect(status.stdout).toBe('');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
