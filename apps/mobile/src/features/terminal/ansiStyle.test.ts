import { terminalPalette } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { ansiHex, ansiTextStyle } from './ansiStyle';

const palette = terminalPalette({ theme: 'follow' }, true);

test('the 16 named colours come from the palette, the rest from xterm 256 colours', () => {
  expect(ansiHex(1, palette)).toBe(palette.red);
  expect(ansiHex(12, palette)).toBe(palette.brightBlue);
  expect(ansiHex(16, palette)).toBe('#000000');
  expect(ansiHex(208, palette)).toBe('#ff8700');
  expect(ansiHex(231, palette)).toBe('#ffffff');
  expect(ansiHex(232, palette)).toBe('#080808');
  expect(ansiHex(255, palette)).toBe('#eeeeee');
  expect(ansiHex('#d77757', palette)).toBe('#d77757');
});

test("a run's style: its colours, inverse swapped over the terminal's own, and its styles", () => {
  expect(ansiTextStyle({}, palette)).toEqual({});
  expect(ansiTextStyle({ fg: 2, bold: true, dim: true }, palette)).toEqual({
    color: palette.green,
    fontWeight: '600',
    opacity: 0.6,
  });
  expect(ansiTextStyle({ inverse: true, italic: true, underline: true }, palette)).toEqual({
    color: palette.background,
    backgroundColor: palette.foreground,
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  });
});
