import { expect, test } from 'vitest';
import { forXterm, fromPage, linesText, streamStep } from './pageMessages';

test("the page's messages are read; anything else is not", () => {
  expect(fromPage('{"type":"size","cols":48,"rows":30}')).toEqual({
    type: 'size',
    cols: 48,
    rows: 30,
  });
  expect(fromPage('{"type":"away","away":true}')).toEqual({ type: 'away', away: true });
  expect(fromPage('{"type":"eval"}')).toBeUndefined();
  expect(fromPage('not json')).toBeUndefined();
});

test('a piece of the stream is written when it goes on from where the terminal is', () => {
  expect(streamStep(10, { from: 10, to: 14, data: 'tide' })).toBe('write');
  // The phone's screen was read after this piece: it is on screen already.
  expect(streamStep(20, { from: 10, to: 14, data: 'tide' })).toBe('drawn');
  expect(streamStep(14, { from: 14, to: 14, data: '' })).toBe('drawn');
});

test('a gap, a burst skipped, or a cut log reads the screen again', () => {
  expect(streamStep(10, { from: 12, to: 16, data: 'moon' })).toBe('reload');
  expect(streamStep(10, { from: 900000, to: 900000, data: '' })).toBe('reload');
  expect(streamStep(10, { from: 3, to: 3, data: '' })).toBe('reload');
});

test('log lines from a Mac with no screen are drawn a line each', () => {
  expect(linesText(['$ ls', 'README.md'])).toBe('$ ls\r\nREADME.md');
});

test("tmux's window-title sequence is taken out; xterm would print the title", () => {
  expect(forXterm('\x1bkecho\x1b\\arrived\r\n\x1b[32mok\x1b[0m')).toBe('arrived\r\n\x1b[32mok\x1b[0m');
});
