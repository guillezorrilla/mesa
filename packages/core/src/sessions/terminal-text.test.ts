import { expect, test } from 'vitest';
import { plainText } from './terminal-text.js';

test('plainText drops CSI sequences: colours with semicolons or colons, modes, the kitty keyboard', () => {
  expect(plainText('\x1b[1m\x1b[38;2;215;119;87mtide\x1b[0m')).toBe('tide');
  expect(plainText('\x1b[38:2::255:100:0mcolon colour\x1b[m')).toBe('colon colour');
  expect(plainText('\x1b[?2004h\x1b[>1u\x1b[<u\x1b[=5ukeys\x1b[?25l')).toBe('keys');
  expect(plainText('\x1b[2K\x1b[1A\x1b[12;40Hmoved')).toBe('moved');
});

test('plainText drops OSC and DCS strings, to BEL or ST, or to the next escape or line when unended', () => {
  expect(plainText('\x1b]0;a title\x07after BEL')).toBe('after BEL');
  expect(plainText('\x1b]8;;https://example.com\x1b\\a link\x1b]8;;\x1b\\')).toBe('a link');
  expect(plainText('\x1bP+q544e\x1b\\after DCS')).toBe('after DCS');
  // tmux's passthrough: a DCS whose body holds an escaped OSC 52.
  expect(plainText('\x1bPtmux;\x1b\x1b]52;c;aGk=\x07\x1b\\after')).toBe('after');
  // One that never ends takes nothing past its line, or past the next escape.
  expect(plainText('before\x1b]0;a title never ended\nafter')).toBe('before\nafter');
  expect(plainText('\x1b]0;unended\x1b[1mbold')).toBe('bold');
  expect(plainText('cut off \x1b]0;at the end')).toBe('cut off ');
});

test('plainText drops a short escape with its character, and a bare ESC', () => {
  expect(plainText('a\x1bMb\x1b7c\x1b8d\x1b(Be\x1b=f\x1b>g')).toBe('abcdefg');
  expect(plainText('a\x1b\nb')).toBe('a\nb');
  expect(plainText('trailing\x1b')).toBe('trailing');
});

test('plainText reads a carriage return as a line break, one with the newline after it', () => {
  expect(plainText('one\r\ntwo\rthree\r\r\nfour\n')).toBe('one\ntwo\nthree\n\nfour\n');
});

test('plainText drops control characters but tab and newline, and keeps any other text', () => {
  expect(plainText('bell\x07 back\x08 nul\x00 del\x7f\ttab\n')).toBe('bell back nul del\ttab\n');
  expect(plainText('é ✓ ⏺ 潮')).toBe('é ✓ ⏺ 潮');
});
