import type { TerminalColors } from '@mesa/core/phone';
import type { AnsiColour, AnsiStyle } from './ansi';

/** The 16 named colours, in their index order: black to white, then the bright ones. */
const NAMED = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

const channel = (level: number) => (level ? level * 40 + 55 : 0).toString(16).padStart(2, '0');

/**
 * Colour `colour` as `#rrggbb`: the first 16 from `palette`, then xterm's 6x6x6 cube and its 24
 * greys, and a true colour as it is.
 */
export function ansiHex(colour: AnsiColour, palette: TerminalColors): string {
  if (typeof colour === 'string') return colour;
  const named = NAMED[colour];
  if (named) return palette[named];
  if (colour >= 232) {
    const grey = ((colour - 232) * 10 + 8).toString(16).padStart(2, '0');
    return `#${grey}${grey}${grey}`;
  }
  const cube = colour - 16;
  return `#${channel(Math.floor(cube / 36))}${channel(Math.floor(cube / 6) % 6)}${channel(cube % 6)}`;
}

/** A run's style as React Native draws it, in `palette`; empty for the terminal's own colours. */
export function ansiTextStyle(style: AnsiStyle, palette: TerminalColors) {
  let fg = style.fg === undefined ? undefined : ansiHex(style.fg, palette);
  let bg = style.bg === undefined ? undefined : ansiHex(style.bg, palette);
  if (style.inverse) [fg, bg] = [bg ?? palette.background, fg ?? palette.foreground];
  return {
    ...(fg ? { color: fg } : {}),
    ...(bg ? { backgroundColor: bg } : {}),
    ...(style.bold ? { fontWeight: '600' as const } : {}),
    ...(style.dim ? { opacity: 0.6 } : {}),
    ...(style.italic ? { fontStyle: 'italic' as const } : {}),
    ...(style.underline ? { textDecorationLine: 'underline' as const } : {}),
  };
}
