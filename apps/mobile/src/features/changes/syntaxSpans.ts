/** A piece of a code line, coloured by what it is; plain text has no kind. */
export type Span = { text: string; kind?: 'keyword' | 'string' | 'comment' | 'number' };

const KEYWORDS =
  'const|let|var|function|return|if|else|for|while|switch|case|break|import|export|from|default|class|extends|new|async|await|type|interface|enum|def|fn|pub|struct|impl|true|false|null|undefined|None|self|this';

/**
 * ponytail: light colour for any language, by one pattern: a `//` comment to the line's end,
 * quoted strings, numbers and common keywords. A language-aware highlighter if this misleads.
 */
const TOKEN = new RegExp(
  `(\\/\\/.*$)|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d[\\d_.]*\\b)|\\b(${KEYWORDS})\\b`,
  'g',
);

/** A line of code cut into spans to colour. */
export function syntaxSpans(line: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const match of line.matchAll(TOKEN)) {
    if (match.index > at) spans.push({ text: line.slice(at, match.index) });
    const kind = match[1] ? 'comment' : match[2] ? 'string' : match[3] ? 'number' : 'keyword';
    spans.push({ text: match[0], kind });
    at = match.index + match[0].length;
  }
  if (at < line.length || !spans.length) spans.push({ text: line.slice(at) });
  return spans;
}
