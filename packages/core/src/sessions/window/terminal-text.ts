// A terminal's output stream as plain text, for a person or a receipt to read: the stream a
// session's output log keeps also holds the escape sequences that colour it and move its cursor.

/**
 * ECMA-48's escape sequences: CSI (colours, cursor moves, modes), then OSC (titles, links, the
 * clipboard) and the other strings (DCS, SOS, PM, APC) up to their terminator, or to the next
 * escape or line when one never ends, then the short escapes (a charset, the keypad, the cursor
 * saved).
 */
const SEQUENCE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: escape sequences are what it matches.
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b[\]PX^_][^\x07\x1b\n]*(?:\x07|\x1b\\)?|\x1b[ -/]*[0-~]/g;
/** Control characters but tab and newline, after carriage returns became newlines. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it matches.
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g;

/**
 * `raw` as plain text: escape sequences and control characters dropped, and a carriage return
 * (with the newline after it, if any) read as one line break.
 * ponytail: what the stream wrote, in order, not the screen it drew; a TUI that moves its cursor
 * to redraw leaves each frame's text. A terminal emulator (@xterm/headless) would give the screen.
 */
export const plainText = (raw: string) =>
  raw.replace(SEQUENCE, '').replace(/\r\n?/g, '\n').replace(CONTROL, '');
