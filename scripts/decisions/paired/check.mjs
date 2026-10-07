// pnpm decisions:paired:check: proves the paired-workflow material (harness.mjs selfCheck) and
// exits 1 when any task's hidden test does not fail as given, pass with its reference solution and
// fail with its naive one, or a note is missing or too long to be sent whole.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selfCheck } from './harness.mjs';

const work = mkdtempSync(join(tmpdir(), 'paired-check-'));
try {
  const result = selfCheck(work);
  for (const r of result.tasks)
    console.log(
      `${r.ok ? 'ok  ' : 'FAIL'} ${r.task.padEnd(15)} stub=${r.stub ? 'pass' : 'fail'} reference=${r.reference ? 'pass' : 'fail'} naive=${r.naive ? 'pass' : 'fail'} note=${r.note ? 'ok' : 'missing or over 200 characters'}`,
    );
  console.log(`${result.notes} notes; ${result.ok ? 'material ok' : 'material BROKEN'}`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
