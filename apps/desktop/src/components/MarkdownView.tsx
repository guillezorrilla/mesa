import type { ReactNode } from 'react';
import Markdown from 'react-markdown';

// Block and inline elements only: no HTML, no images, so nothing remote ever loads.
const ALLOWED = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'em',
  'strong',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'br',
  'a',
];

/**
 * Markdown as inert React elements. A link is underlined text, unless `link` renders it from its
 * href; `link` returns undefined for one it leaves as text.
 */
export function MarkdownView(props: {
  text: string;
  link?: (href: string, children: ReactNode) => ReactNode;
}) {
  return (
    <Markdown
      skipHtml
      allowedElements={ALLOWED}
      components={{
        a: ({ href, children }) =>
          (href === undefined ? undefined : props.link?.(href, children)) ?? (
            <span className="underline">{children}</span>
          ),
      }}
    >
      {props.text}
    </Markdown>
  );
}
