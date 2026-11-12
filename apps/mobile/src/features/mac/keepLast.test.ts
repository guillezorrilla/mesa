import { expect, test } from 'vitest';
import { keepLast } from './tryCall';

test('a failed read keeps the last answer with its error; a good one replaces it', async () => {
  const last: Promise<{ result?: number; error?: string }> = Promise.resolve({ result: 1 });
  expect(await keepLast<{ result?: number; error?: string }>({ error: 'asleep' }, last)).toEqual({ result: 1, error: 'asleep' });
  expect(await keepLast({ result: 2 }, last)).toEqual({ result: 2 });
});
