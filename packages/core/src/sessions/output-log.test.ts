import { closeSync, openSync, readFileSync, statSync, writeSync } from 'node:fs';
import { expect, test } from 'vitest';
import { plantOutputLog, profilePaths, tempDir } from '../testing/index.js';
import { outputTail } from './output-log.js';

const MB = 1024 * 1024;

test('outputTail reads the raw stream as plain text: escapes, controls, and blank lines dropped', () => {
  const home = tempDir();
  const logs = profilePaths(home, 'default').logs;
  expect(outputTail(logs, 'a1b2c3d4')).toBeUndefined();
  plantOutputLog(
    home,
    'a1b2c3d4',
    [
      '\x1b]0;claude\x07\x1b[?2004h\x1b[>1u\x1b[1m\x1b[38;2;215;119;87mTide tables\x1b[0m   \r\n',
      '\x1b[2K\x1b[1A\x1b[G\r\n\r\n',
      '\x1b]8;;https://example.com\x1b\\a link\x1b]8;;\x1b\\ and a bell\x07\r\n',
      'Working\rDone\x08!\r\n',
      '\x1bP+q544e\x1b\\\x1b(B\x1b=\tindented\r\n',
      '\x1b]0;a title never ended\r\nstill here\r\n',
      'last line, no newline yet',
    ].join(''),
  );
  expect(outputTail(logs, 'a1b2c3d4')).toEqual([
    'Tide tables',
    'a link and a bell',
    'Working',
    'Done!',
    '\tindented',
    'still here',
    'last line, no newline yet',
  ]);
  expect(outputTail(logs, 'a1b2c3d4', 2)).toEqual(['still here', 'last line, no newline yet']);
  expect(outputTail(logs, 'a1b2c3d4', 0)).toEqual([]);
  expect(outputTail(logs, 'a1b2c3d4', 50)).toHaveLength(7);
});

test('a log over 20 MB is cut in place to its last 5 MB, from a whole line, and its writer goes on', () => {
  const home = tempDir();
  const line = (n: number) => `line ${String(n).padStart(9, '0')}\n`;
  const count = Math.ceil((20 * MB + 1) / line(0).length);
  const file = plantOutputLog(
    home,
    'a1b2c3d4',
    Buffer.from(Array.from({ length: count }, (_, n) => line(n)).join('')),
  );
  const { ino, size } = statSync(file);
  expect(size).toBeGreaterThan(20 * MB);
  // The window's `cat >>`: a writer that opened the file for appending before the cut.
  const writer = openSync(file, 'a');
  try {
    const logs = profilePaths(home, 'default').logs;
    expect(outputTail(logs, 'a1b2c3d4', 1)).toEqual([line(count - 1).trim()]);
    const cut = statSync(file);
    expect(cut.ino).toBe(ino);
    expect(cut.size).toBeLessThanOrEqual(5 * MB);
    expect(cut.size).toBeGreaterThan(5 * MB - line(0).length);
    expect(readFileSync(file, 'utf8')).toMatch(/^line \d{9}\n/);
    writeSync(writer, 'after the cut\n');
  } finally {
    closeSync(writer);
  }
  expect(readFileSync(file, 'utf8').endsWith(`${line(count - 1)}after the cut\n`)).toBe(true);
  expect(statSync(file).size).toBeLessThan(6 * MB);
});

test('a log of 20 MB or less is left whole', () => {
  const home = tempDir();
  const file = plantOutputLog(home, 'a1b2c3d4', Buffer.alloc(20 * MB, 'x'));
  expect(outputTail(profilePaths(home, 'default').logs, 'a1b2c3d4', 1)?.[0]).toHaveLength(20 * MB);
  expect(statSync(file).size).toBe(20 * MB);
});
