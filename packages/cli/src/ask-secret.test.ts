import { PassThrough } from 'node:stream';
import type { ReadStream } from 'node:tty';
import { expect, test } from 'vitest';
import { terminalSecret } from './ask-secret.js';

/** A terminal in memory: what the person types, what the prompt wrote, and its raw modes. */
function terminal() {
  const raw: boolean[] = [];
  const input = Object.assign(new PassThrough(), {
    setRawMode: (on: boolean) => {
      raw.push(on);
      return input;
    },
  });
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk) => {
    written += String(chunk);
  });
  const ask = terminalSecret(input as unknown as ReadStream, output);
  return { input, raw, written: () => written, ask };
}

test('the typed secret comes back, Backspace applied, and is never echoed', async () => {
  const t = terminal();
  const asked = t.ask('TypeSafe key: ');
  t.input.write('ts-ab');
  t.input.write('x\x7fcd\r');
  await expect(asked).resolves.toBe('ts-abcd');
  expect(t.written()).toBe('TypeSafe key: \n');
  expect(t.raw).toEqual([true, false]);
});

test('Ctrl+C gives nothing; Ctrl+D and the end of the input give what was typed', async () => {
  const interrupted = terminal();
  const stopped = interrupted.ask('key: ');
  interrupted.input.write('ts-ab\x03');
  await expect(stopped).resolves.toBe('');

  const quit = terminal();
  const done = quit.ask('key: ');
  quit.input.write('ts-ab\x04');
  await expect(done).resolves.toBe('ts-ab');

  const ends = terminal();
  const asked = ends.ask('key: ');
  ends.input.end('ts-ab');
  await expect(asked).resolves.toBe('ts-ab');
});
