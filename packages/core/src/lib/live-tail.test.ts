import { appendFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { tempDir } from '../testing/index.js';
import { tailLines } from './file-tail.js';
import { LIVE_FILES, LIVE_IDLE_MS, liveTail, liveTailHeld } from './live-tail.js';

afterEach(() => {
  vi.useRealTimers();
});

/** What a full read of the last `bytes` gives: tailLines' lines, but the empty one after the last newline. */
const fullRead = (file: string, bytes: number) => {
  const { lines, truncated } = tailLines(file, bytes);
  return { values: lines.at(-1) === '' ? lines.slice(0, -1) : lines, truncated };
};

test('reads after appends, a partial line, a shrink and a replacement match a full read', () => {
  const file = join(tempDir('live-tail-'), 'kettle.jsonl');
  const parsed: string[] = [];
  const parse = (line: string) => {
    parsed.push(line);
    return line;
  };
  const read = () => liveTail(file, 40, parse);

  writeFileSync(file, 'alpha\nbravo\n');
  expect(read()).toEqual(fullRead(file, 40));
  appendFileSync(file, 'charlie\ndel');
  expect(read()).toEqual(fullRead(file, 40));
  expect(read().values).toEqual(['alpha', 'bravo', 'charlie', 'del']);
  // The partial line is kept once whole; past 40 bytes the oldest lines slide out.
  appendFileSync(file, 'ta\necho-echo-echo\nfoxtrot\n');
  expect(read()).toEqual(fullRead(file, 40));
  expect(read().truncated).toBe(true);
  appendFileSync(file, 'golf-golf-golf-golf-golf-golf-golf-golf-golf\nhotel\n');
  expect(read()).toEqual(fullRead(file, 40));
  // Each whole line was parsed once, the one cut by the limit never; the partial one on each read.
  expect(parsed.filter((line) => line !== 'del')).toEqual([
    'alpha',
    'bravo',
    'charlie',
    'delta',
    'echo-echo-echo',
    'foxtrot',
    'hotel',
  ]);

  writeFileSync(file, 'india\n');
  expect(read()).toEqual({ values: ['india'], truncated: false });
  // Rewritten in place, as long or longer: not taken for an append.
  writeFileSync(file, 'indigo\nlima\n');
  expect(read()).toEqual({ values: ['indigo', 'lima'], truncated: false });
  const other = join(tempDir('live-tail-'), 'other.jsonl');
  writeFileSync(other, 'juliet\nkilo\n');
  renameSync(other, file);
  expect(read()).toEqual({ values: ['juliet', 'kilo'], truncated: false });
});

test('a process keeps a few files and drops one left unread', () => {
  vi.useFakeTimers();
  const dir = tempDir('live-tail-');
  const files = Array.from({ length: LIVE_FILES + 2 }, (_, n) => join(dir, `${n}.jsonl`));
  for (const file of files) {
    writeFileSync(file, 'line\n');
    liveTail(file, 1 << 10, String);
  }
  expect(liveTailHeld()).toBe(LIVE_FILES);
  vi.advanceTimersByTime(LIVE_IDLE_MS);
  liveTail(files[0] as string, 1 << 10, String);
  expect(liveTailHeld()).toBe(1);
});
