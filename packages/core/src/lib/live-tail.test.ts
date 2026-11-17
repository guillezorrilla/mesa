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

test('a character split across two writes is read whole once its line is', () => {
  const file = join(tempDir('live-tail-'), 'tide.jsonl');
  const e = Buffer.from('é');
  writeFileSync(file, Buffer.concat([Buffer.from('marée\ncaf'), e.subarray(0, 1)]));
  expect(liveTail(file, 1 << 10, String)).toEqual(fullRead(file, 1 << 10));
  appendFileSync(file, Buffer.concat([e.subarray(1), Buffer.from('\n')]));
  expect(liveTail(file, 1 << 10, String)).toEqual({ values: ['marée', 'café'], truncated: false });
});

test('each window of a file is kept apart', () => {
  const file = join(tempDir('live-tail-'), 'tide.jsonl');
  writeFileSync(file, 'alpha\nbravo\ncharlie\n');
  expect(liveTail(file, 1 << 10, String)).toEqual(fullRead(file, 1 << 10));
  expect(liveTail(file, 10, String)).toEqual(fullRead(file, 10));
  appendFileSync(file, 'delta\n');
  expect(liveTail(file, 1 << 10, String)).toEqual(fullRead(file, 1 << 10));
  expect(liveTail(file, 10, String)).toEqual(fullRead(file, 10));
});

test('kept values are frozen', () => {
  const file = join(tempDir('live-tail-'), 'tide.jsonl');
  writeFileSync(file, 'alpha\nbrav');
  const [whole, partial] = liveTail(file, 1 << 10, (line) => ({ line })).values;
  expect(Object.isFrozen(whole)).toBe(true);
  expect(Object.isFrozen(partial)).toBe(true);
});

test('a process keeps the files read most recently and drops one left unread', () => {
  vi.useFakeTimers();
  const dir = tempDir('live-tail-');
  const files = Array.from({ length: LIVE_FILES + 1 }, (_, n) => join(dir, `${n}.jsonl`));
  const read = (file: string) => liveTail(file, 1 << 10, String);
  for (const file of files) writeFileSync(file, 'line\n');
  for (const file of files.slice(0, LIVE_FILES)) read(file);
  read(files[0] as string); // read again, so the second is now the least recent
  read(files[LIVE_FILES] as string);
  expect(liveTailHeld()).toEqual([...files.slice(2, LIVE_FILES), files[0], files[LIVE_FILES]]);
  vi.advanceTimersByTime(LIVE_IDLE_MS);
  read(files[1] as string);
  expect(liveTailHeld()).toEqual([files[1]]);
});
