// GitHub's `<details>` sections, cut out of an HTML block so the Markdown component draws each as a
// section that opens on tap, as orca's mobile app does (mobile-markdown-details.ts).

export type DetailsPiece =
  | { kind: 'html'; value: string }
  | { kind: 'open'; open: boolean }
  | { kind: 'summary'; value: string }
  | { kind: 'close' };

// A summary's text stops at the next summary tag, so an unclosed one stays linear.
const DETAILS =
  /<details(?=[\s/>])([^<>]*)>|<summary(?=[\s/>])[^<>]*>((?:(?!<\/?summary\b)[\s\S])*)<\/summary\s*>|<\/details\s*>/gi;

/** `open` as an attribute name, not inside a quoted value such as title="open logs". */
const isOpen = (attrs: string) =>
  /(?:^|\s)open(?:[\s=]|$)/i.test(attrs.replace(/"[^"]*"|'[^']*'/g, ''));

/** One HTML block as its `<details>`, `<summary>` and `</details>` markup and the HTML between. */
export function detailsPieces(html: string): DetailsPiece[] {
  const pieces: DetailsPiece[] = [];
  const between = (value: string) => {
    if (value.trim()) pieces.push({ kind: 'html', value });
  };
  let from = 0;
  for (const match of html.matchAll(DETAILS)) {
    between(html.slice(from, match.index));
    const [markup, attrs, summary] = match;
    if (summary !== undefined) pieces.push({ kind: 'summary', value: summary });
    else if (markup.startsWith('</')) pieces.push({ kind: 'close' });
    else pieces.push({ kind: 'open', open: isOpen(attrs ?? '') });
    from = match.index + markup.length;
  }
  between(html.slice(from));
  return pieces;
}
