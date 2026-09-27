import { expect, test } from 'vitest';
import { execRunner } from './process.js';

test('the runner closes stdin, so a headless provider waiting for EOF can finish', async () => {
  expect(await execRunner('/bin/cat', [], 1000)).toEqual({ ok: true, stdout: '' });
});
