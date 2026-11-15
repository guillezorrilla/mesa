import { TERMINAL_PRESETS } from '@mesa/core/browser';
import { expect, test } from 'vitest';
import { ansiSpans } from './ansiSpans';

const palette = TERMINAL_PRESETS['mesa-dark'].colors;

test('SGR colours and weights become styled runs; other escapes are dropped', () => {
  expect(ansiSpans('\x1b[1mContext\x1b[22m \x1b[38;5;246m4%\x1b[39m\x1b[2K', palette)).toEqual([
    { text: 'Context', bold: true },
    { text: ' ' },
    { text: '4%', color: 'rgb(148,148,148)' },
  ]);
  expect(ansiSpans('\x1b[31;48;2;1;2;3mx\x1b[0my', palette)).toEqual([
    { text: 'x', color: palette.red, background: 'rgb(1,2,3)' },
    { text: 'y' },
  ]);
  expect(ansiSpans('\x1b[7m❯ pick\x1b[27m', palette)).toEqual([
    { text: '❯ pick', color: palette.background, background: palette.foreground },
  ]);
});
