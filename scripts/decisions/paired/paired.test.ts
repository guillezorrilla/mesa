import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { selfCheck } from './harness.mjs';

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
