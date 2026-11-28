import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compactRunOutput, runOutput } from './files.js';

test("a streamed run's output keeps only its result once it ends: no tool result it read stays", () => {
  const runs = mkdtempSync(join(tmpdir(), 'mesa-runs-'));
  const result = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Berth 7.',
    session_id: 's',
    duration_ms: 1,
  });
  writeFileSync(
    runOutput(runs, 'r1'),
    [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: 'DB_PASSWORD=invented' }] },
      }),
      result,
    ].join('\n'),
  );
  compactRunOutput(runs, 'r1');
  expect(readFileSync(runOutput(runs, 'r1'), 'utf8')).toBe(`${result}\n`);
  // One JSON object, or lines with no result, stay as they are.
  writeFileSync(runOutput(runs, 'r2'), '{\n  "type": "result"\n}');
  compactRunOutput(runs, 'r2');
  expect(readFileSync(runOutput(runs, 'r2'), 'utf8')).toBe('{\n  "type": "result"\n}');
  compactRunOutput(runs, 'missing');
});
