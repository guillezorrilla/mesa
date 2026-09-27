import { PassThrough } from 'node:stream';
import { expect, test } from 'vitest';
import { terminalConfirm } from './confirm.js';

/** A terminal in memory: what the person types, and what the question wrote. */
function terminal({ tty = false } = {}) {
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), tty ? { isTTY: true, columns: 80 } : {});
  let written = '';
  output.on('data', (chunk) => {
    written += String(chunk);
  });
  return { input, output, written: () => written, ask: terminalConfirm(input, output) };
}

test('y or yes is yes, anything else is no; the question ends in [y/N]', async () => {
  for (const [reply, yes] of [
    ['y', true],
    [' YES ', true],
    ['n', false],
    ['', false],
    ['yep', false],
  ] as const) {
    const t = terminal();
    const asked = t.ask('Send it?');
    t.input.write(`${reply}\n`);
    await expect(asked).resolves.toBe(yes);
    expect(t.written()).toContain('Send it? [y/N] ');
  }
});

test('no answer at all is no, and it settles: the input ends, has ended, Ctrl+D, or Ctrl+C', async () => {
  const ends = terminal();
  const asked = ends.ask('Send it?');
  ends.input.end();
  await expect(asked).resolves.toBe(false);

  const ended = terminal();
  ended.input.end();
  ended.input.resume();
  await new Promise((done) => ended.input.once('end', done));
  await expect(ended.ask('Send it?')).resolves.toBe(false);

  // In a terminal, Ctrl+D closes the prompt while the input stays open.
  const closed = terminal({ tty: true });
  const quit = closed.ask('Send it?');
  closed.input.write('\x04');
  await expect(quit).resolves.toBe(false);

  const interrupted = terminal({ tty: true });
  const stopped = interrupted.ask('Send it?');
  interrupted.input.write('\x03');
  await expect(stopped).resolves.toBe(false);
});
