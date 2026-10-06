import { expect, test } from 'vitest';
import { envRunner } from './process.js';

test('the runner closes stdin, so a headless provider waiting for EOF can finish', async () => {
  expect(await envRunner({})('/bin/cat', [], 1000)).toEqual({ ok: true, stdout: '' });
});

test('the runner runs in its environment unless the caller passes one', async () => {
  const run = envRunner({ MESA_PLACE: 'injected' });
  expect(await run('/bin/sh', ['-c', 'echo $MESA_PLACE'], 1000)).toEqual({
    ok: true,
    stdout: 'injected\n',
  });
  expect(
    await run('/bin/sh', ['-c', 'echo $MESA_PLACE'], 1000, { env: { MESA_PLACE: 'own' } }),
  ).toEqual({ ok: true, stdout: 'own\n' });
});
