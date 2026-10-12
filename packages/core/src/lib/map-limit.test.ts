import { expect, test } from 'vitest';
import { mapLimit } from './map-limit.js';

test('mapLimit runs at most `limit` at once and keeps the order', async () => {
  let running = 0;
  let most = 0;
  const done = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (n) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, n));
    running -= 1;
    return n * 10;
  });
  expect(done).toEqual([50, 10, 40, 20, 30, 0]);
  expect(most).toBe(2);
  expect(await mapLimit([], 4, async () => 1)).toEqual([]);
});
