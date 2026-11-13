/** The tags GitHub's sanitizer lets through in a PR or issue body; any other tag shows as typed. */
export const GITHUB_TAGS = new Set(
  (
    'a abbr b bdo blockquote br caption cite code dd del details dfn div dl dt em figcaption ' +
    'figure h1 h2 h3 h4 h5 h6 hr i img input ins kbd li mark ol p picture pre q rp rt ruby s ' +
    'samp small source span strike strong sub summary sup table tbody td tfoot th thead time ' +
    'tr tt ul var video wbr'
  ).split(' '),
);

/** The inline tags GitHub draws as a span, by the span: markdown-it's name for it (`strong` for
 *  `<b>`), read by inlineTag for inline HTML and by htmlToMarkdown for block HTML. */
export const SPANS: Record<string, string> = {
  a: 'link',
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  del: 's',
  s: 's',
  strike: 's',
  code: 'code',
  kbd: 'code',
  tt: 'code',
};

/** One attribute's value in a tag's attribute text, quoted or bare; '' when absent. */
export function attr(attrs: string, name: string) {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(
    attrs,
  );
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').replaceAll('&amp;', '&');
}
