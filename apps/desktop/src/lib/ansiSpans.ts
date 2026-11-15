import { SEQUENCE, type TerminalColors } from '@mesa/core/browser';

/** A run of text in one style: its colours as CSS, and its weight, slant and underline. */
export type AnsiSpan = {
  text: string;
  color?: string;
  background?: string;
  bold?: true;
  dim?: true;
  italic?: true;
  underline?: true;
};

/** The 16 base colours by their SGR index, as a terminal palette names them. */
const BASE = [
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

/** Colour `n` of xterm's 256: the palette's 16, then the 6x6x6 cube, then 24 greys. */
function indexed(n: number, palette: TerminalColors): string | undefined {
  const base = BASE[n];
  if (base) return palette[base];
  if (n < 16 || n > 255) return undefined;
  if (n >= 232) {
    const grey = 8 + (n - 232) * 10;
    return `rgb(${grey},${grey},${grey})`;
  }
  const level = (v: number) => (v ? 55 + v * 40 : 0);
  const c = n - 16;
  return `rgb(${level(Math.floor(c / 36))},${level(Math.floor(c / 6) % 6)},${level(c % 6)})`;
}

type Style = Omit<AnsiSpan, 'text'> & { inverse?: true };

/**
 * One terminal line as styled runs: its SGR colours (16, 256 and true colour, from `palette`),
 * bold, dim, italic, underline and inverse kept; every other escape sequence dropped.
 */
export function ansiSpans(line: string, palette: TerminalColors): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let style: Style = {};
  let at = 0;
  const push = (text: string) => {
    if (!text) return;
    const { inverse, ...rest } = style;
    const span: AnsiSpan = { text, ...rest };
    if (inverse) {
      span.color = style.background ?? palette.background;
      span.background = style.color ?? palette.foreground;
    }
    spans.push(span);
  };
  for (const match of line.matchAll(SEQUENCE)) {
    push(line.slice(at, match.index));
    at = match.index + match[0].length;
    // An SGR one (`ESC [ 1;31 m`) sets the style; core's SEQUENCE finds every escape sequence.
    const sequence = match[0];
    if (sequence.startsWith('\x1b[') && sequence.endsWith('m'))
      style = applied(style, sequence.slice(2, -1), palette);
  }
  push(line.slice(at));
  return spans;
}

/** `style` after SGR parameters `params` (`1;38;5;208`). */
function applied(style: Style, params: string, palette: TerminalColors): Style {
  const codes = (params || '0').split(/[;:]/).map(Number);
  const next: Style = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i] ?? 0;
    if (code === 0) for (const key of Object.keys(next)) delete next[key as keyof Style];
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if (code === 27) delete next.inverse;
    else if (code === 39) delete next.color;
    else if (code === 49) delete next.background;
    else if (code === 38 || code === 48) {
      const key = code === 38 ? 'color' : 'background';
      let value: string | undefined;
      if (codes[i + 1] === 5) {
        value = indexed(codes[i + 2] ?? -1, palette);
        i += 2;
      } else if (codes[i + 1] === 2) {
        value = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
        i += 4;
      }
      if (value) next[key] = value;
    } else if (code >= 30 && code <= 37) next.color = indexed(code - 30, palette);
    else if (code >= 40 && code <= 47) next.background = indexed(code - 40, palette);
    else if (code >= 90 && code <= 97) next.color = indexed(code - 82, palette);
    else if (code >= 100 && code <= 107) next.background = indexed(code - 92, palette);
  }
  return next;
}
