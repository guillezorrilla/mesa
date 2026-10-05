import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../testing/index.js';
import { lastMatchingLine } from './file-tail.js';

/** Every line `lastMatchingLine` hands over, last first, when none matches. */
function linesSeen(content: string, limit?: number) {
  const file = join(tempDir(), 'tail.jsonl');
  writeFileSync(file, content);
  const seen: string[] = [];
  lastMatchingLine(
    file,
    (line) => {
      seen.push(line);
      return undefined;
    },
    limit,
  );
  return seen;
}

test('a byte limit reads only the end of the file and skips the line it cuts', () => {
  expect(linesSeen('alpha\nbravo\ncharlie')).toEqual(['charlie', 'bravo', 'alpha']);
  expect(linesSeen('alpha\nbravo\ncharlie', 10)).toEqual(['charlie']);
  expect(linesSeen('alpha\nbravo\ncharlie', 100)).toEqual(['charlie', 'bravo', 'alpha']);
});
