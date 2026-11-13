/** A colour as the terminal named it: an index into its 256 colours, or `#rrggbb`. */
export type AnsiColour = number | string;

/** How a run of text is drawn, as its colour and style (SGR) sequences set it. */
export type AnsiStyle = {
  fg?: AnsiColour;
  bg?: AnsiColour;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
};

export type AnsiSpan = AnsiStyle & { text: string };

/** One output line: its runs of text in their styles, and its plain text. */
export type AnsiLine = { text: string; spans: AnsiSpan[] };

// biome-ignore lint/suspicious/noControlCharactersInRegex: escape sequences are what it matches.
const SGR = /\x1b\[([0-9;:]*)m/g;

const hex = (parts: string[]) =>
  `#${parts
    .map((part) =>
      Math.min(255, Number(part) || 0)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/**
 * An extended colour (38, 48) from its arguments: `5;n` for one of the 256, `2;r;g;b` for any;
 * with colons, `2::r:g:b` may name a colour space first. Returns the colour and how many of the
 * `;`-separated codes it took.
 */
function extended(codes: string[], at: number): [AnsiColour | undefined, number] {
  const [, ...sub] = (codes[at] ?? '').split(':');
  if (sub.length) {
    if (sub[0] === '5') return [Number(sub[1]), 0];
    return [sub[0] === '2' ? hex(sub.slice(-3)) : undefined, 0];
  }
  if (codes[at + 1] === '5') return [Number(codes[at + 2]), 2];
  if (codes[at + 1] === '2') return [hex(codes.slice(at + 2, at + 5)), 4];
  return [undefined, 0];
}

/** `style` after one SGR sequence's codes (`1;38;5;208`); an empty sequence resets it. */
function applied(style: AnsiStyle, params: string): AnsiStyle {
  const codes = params.split(';');
  let next = { ...style };
  for (let at = 0; at < codes.length; at++) {
    const code = Number((codes[at] ?? '').split(':')[0] || 0);
    if (code === 38 || code === 48) {
      const [colour, took] = extended(codes, at);
      next[code === 38 ? 'fg' : 'bg'] = colour;
      at += took;
    } else if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 22) next = { ...next, bold: false, dim: false };
    else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 27) next.inverse = false;
    else if (code >= 30 && code <= 37) next.fg = code - 30;
    else if (code === 39) next.fg = undefined;
    else if (code >= 40 && code <= 47) next.bg = code - 40;
    else if (code === 49) next.bg = undefined;
    else if (code >= 90 && code <= 97) next.fg = code - 90 + 8;
    else if (code >= 100 && code <= 107) next.bg = code - 100 + 8;
  }
  return next;
}

/**
 * Output lines as the Mac sends them, with their colour and style sequences, as runs of styled
 * text. A style carries over to the next line, as in a terminal.
 */
export function ansiLines(lines: string[]): AnsiLine[] {
  let style: AnsiStyle = {};
  return lines.map((line) => {
    const spans: AnsiSpan[] = [];
    let at = 0;
    const add = (end: number) => {
      if (end > at) spans.push({ ...style, text: line.slice(at, end) });
    };
    for (const match of line.matchAll(SGR)) {
      add(match.index);
      style = applied(style, match[1] ?? '');
      at = match.index + match[0].length;
    }
    add(line.length);
    return { text: spans.map((span) => span.text).join(''), spans };
  });
}
