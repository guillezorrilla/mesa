import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../testing/index.js';
import { fileHead } from './file-head.js';

const KIB = 1024;

/** A file of `content`, and the head lengths `fileHead` asks `enough` about, in order. */
function stepsOver(content: string | Buffer, limit: number, enough = (_head: string) => false) {
  const file = join(tempDir(), 'head.jsonl');
  writeFileSync(file, content);
  const asked: number[] = [];
  const head = fileHead(file, limit, (text) => {
    asked.push(text.length);
    return enough(text);
  });
  return { head, asked };
}

test('it reads in steps that double from 32 KiB until enough says so', () => {
  const content = 'a'.repeat(200 * KIB);
  const { head, asked } = stepsOver(content, 1024 * KIB, (text) => text.length >= 90 * KIB);
  expect(asked).toEqual([32 * KIB, 96 * KIB]);
  expect(head).toBe(content.slice(0, 96 * KIB));
});

test('it stops at the limit, and at the end of a shorter file', () => {
  const content = 'b'.repeat(200 * KIB);
  expect(stepsOver(content, 50 * KIB)).toEqual({
    head: content.slice(0, 50 * KIB),
    asked: [32 * KIB],
  });
  expect(stepsOver('one line\n', 1024 * KIB)).toEqual({ head: 'one line\n', asked: [] });
});

test('a character the limit cuts reads as U+FFFD', () => {
  // "e" with an acute accent is two bytes in UTF-8; a limit of 2 keeps only its first.
  const { head } = stepsOver(Buffer.from('aéz', 'utf8'), 2);
  expect(head).toBe('a�');
});
